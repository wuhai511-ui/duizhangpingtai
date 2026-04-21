import { PrismaClient } from '@prisma/client';
import type { Pool } from '../types/database.js';
import { AccParser } from '../parser/acc-parser.js';
import { BusinessOrderParser } from '../parser/business-order-parser.js';
import { D0Parser } from '../parser/d0-parser.js';
import { DwParser } from '../parser/dw-parser.js';
import { JsParser } from '../parser/js-parser.js';
import { JyFqParser } from '../parser/jy-fq-parser.js';
import { JyParser } from '../parser/jy-parser.js';
import { JzParser } from '../parser/jz-parser.js';
import { SepParser } from '../parser/sep-parser.js';

export interface ProcessResult {
  success: boolean;
  records: number;
  type?: string;
  error?: string;
  fileId?: string;
}

type FileSource = 'sftp' | 'upload' | 'api';

export interface FileMeta {
  id: string;
  filename: string;
  type: string;
  source: string;
  records: number;
  createdAt: string;
}

interface ListFilesOptions {
  page: number;
  pageSize: number;
  fileType?: string;
}

const FILE_PARSERS: Record<string, any> = {
  JY: new JyParser(),
  JS: new JsParser(),
  JZ: new JzParser(),
  ACC: new AccParser(),
  SEP: new SepParser(),
  DW: new DwParser(),
  D0: new D0Parser(),
  JY_FQ: new JyFqParser(),
  BUSINESS_ORDER: new BusinessOrderParser(),
};

export class FileProcessor {
  private prisma: PrismaClient | null = null;
  private files = new Map<string, FileMeta>();
  private fileRecords = new Map<string, unknown[]>();

  constructor(private pool: Pool) {
    void this.pool;
  }

  setPrisma(prisma: PrismaClient): void {
    this.prisma = prisma;
  }

  async processBuffer(
    content: string,
    filename: string,
    source: FileSource,
    forcedFileType?: string,
    buffer?: Buffer,
    merchantId?: string
  ): Promise<ProcessResult> {
    if (!content && !buffer) {
      return { success: false, records: 0, error: 'Empty file content' };
    }

    const fileType =
      forcedFileType ||
      guessFileType(filename) ||
      detectFileTypeFromContent(content, filename, buffer);

    if (!fileType || fileType === 'PROOF' || fileType === 'SEP_SUM') {
      return {
        success: false,
        records: 0,
        error: `Unknown or unsupported file type: ${filename}`,
      };
    }

    const parser = FILE_PARSERS[fileType];
    if (!parser) {
      return { success: false, records: 0, error: `No parser for ${fileType}` };
    }

    let parseResult;
    try {
      parseResult = parser.parse(content, filename, buffer);
    } catch (error) {
      return {
        success: false,
        records: 0,
        error: (error as Error).message || 'Parse failed',
      };
    }

    if (!parseResult.success) {
      return { success: false, records: 0, error: parseResult.error };
    }

    const fileId = `${fileType}_${Date.now()}`;
    let savedCount = parseResult.records.length;

    try {
      if (this.prisma) {
        savedCount = await this.saveRecords(fileType, parseResult.records, fileId, merchantId);
      }
    } catch (error) {
      return {
        success: false,
        records: 0,
        error: (error as Error).message || 'Save records failed',
      };
    }

    this.files.set(fileId, {
      id: fileId,
      filename,
      type: fileType,
      source,
      records: savedCount,
      createdAt: new Date().toISOString(),
    });

    if (parseResult.records.length > 0) {
      this.fileRecords.set(fileId, parseResult.records);
    }

    return {
      success: true,
      records: savedCount,
      type: fileType,
      fileId,
    };
  }

  async processFile(content: string, filename: string, source: FileSource): Promise<ProcessResult> {
    return this.processBuffer(content, filename, source);
  }

  listFiles(opts: ListFilesOptions): { items: FileMeta[]; total: number } {
    let files = Array.from(this.files.values());

    if (opts.fileType) {
      files = files.filter((item) => item.type === opts.fileType);
    }

    files.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const total = files.length;
    const start = (opts.page - 1) * opts.pageSize;

    return { items: files.slice(start, start + opts.pageSize), total };
  }

  getFile(id: string): FileMeta | undefined {
    return this.files.get(id);
  }

  getFileRecords(id: string, opts?: Partial<ListFilesOptions>): { records: unknown[]; total: number } | null {
    if (!this.files.has(id)) {
      return null;
    }

    const allRecords = this.fileRecords.get(id) || [];
    if (!opts || (!opts.page && !opts.pageSize)) {
      return { records: allRecords, total: allRecords.length };
    }

    const page = opts.page || 1;
    const pageSize = opts.pageSize || 20;
    const start = (page - 1) * pageSize;
    return { records: allRecords.slice(start, start + pageSize), total: allRecords.length };
  }

  private async saveRecords(fileType: string, records: any[], fileId?: string, merchantId?: string): Promise<number> {
    if (!this.prisma) {
      return records.length;
    }

    let effectiveMerchantId = merchantId;

    // 如果没有传入 merchantId，尝试从请求上下文或默认商户获取
    if (!effectiveMerchantId) {
      const merchant = await this.prisma.merchant.upsert({
        where: { merchant_no: 'DEFAULT' },
        update: {},
        create: { merchant_no: 'DEFAULT', name: 'DEFAULT', status: 1 },
      });
      effectiveMerchantId = merchant.id;
    }

    const ensuredMerchantId = effectiveMerchantId as string;

    switch (fileType) {
      case 'JY':
        return this.saveJyTransactions(ensuredMerchantId, records);
      case 'JS':
        return this.saveJsSettlements(ensuredMerchantId, records);
      case 'JZ':
        return this.saveJzSettlements(ensuredMerchantId, records);
      case 'ACC':
        return this.saveAccSettlements(ensuredMerchantId, records);
      case 'SEP':
        return this.saveSepTransactions(ensuredMerchantId, records);
      case 'DW':
        return this.saveDwWithdrawals(ensuredMerchantId, records);
      case 'D0':
        return this.saveD0Withdrawals(ensuredMerchantId, records);
      case 'JY_FQ':
        return this.saveJyInstallments(ensuredMerchantId, records);
      case 'BUSINESS_ORDER':
        return this.saveBusinessOrders(ensuredMerchantId, records, fileId);
      default:
        return records.length;
    }
  }

  private async saveJyTransactions(merchantId: string, records: any[]): Promise<number> {
    for (const record of records) {
      await this.prisma!.jyTransaction.upsert({
        where: {
          merchantId_merchant_order_no: {
            merchantId,
            merchant_order_no:
              record.merchant_order_no ||
              record.merchantOrderNo ||
              record.lakala_serial ||
              `jy_${record.trans_date}_${record.lakala_serial}`,
          },
        },
        update: {
          amount: BigInt(record.amount || 0),
          fee: BigInt(record.fee || 0),
          settle_amount: BigInt(record.settle_amount || record.settleAmount || 0),
        },
        create: {
          merchantId,
          trans_date: record.trans_date || '',
          trans_time: record.trans_time || '',
          terminal_no: record.terminal_no || record.terminalNo || null,
          branch_name: record.branch_name || record.branchName || null,
          trans_type: record.trans_type || record.transType || null,
          lakala_serial: record.lakala_serial || record.lakalaSerial || '',
          orig_lakala_serial: record.orig_lakala_serial || record.origLakalaSerial || null,
          card_no: record.card_no || record.cardNo || null,
          pay_channel: record.pay_channel || record.payChannel || null,
          bank_name: record.bank_name || record.bankName || null,
          amount: BigInt(record.amount || 0),
          fee: BigInt(record.fee || 0),
          settle_amount: BigInt(record.settle_amount || record.settleAmount || 0),
          merchant_order_no: record.merchant_order_no || record.merchantOrderNo || null,
          pay_order_no: record.pay_order_no || record.payOrderNo || null,
          external_serial: record.external_serial || record.externalSerial || null,
          sys_ref_no: record.sys_ref_no || record.sysRefNo || null,
          remark: record.remark || null,
          pay_method: record.pay_method || record.payMethod || null,
        },
      });
    }
    return records.length;
  }

  private async saveJsSettlements(merchantId: string, records: any[]): Promise<number> {
    for (const record of records) {
      const serial = record.lakala_serial || record.lakalaSerial || '';
      const settleDate = record.settle_date || record.settleDate || '';
      await this.prisma!.jsSettlement.upsert({
        where: {
          merchantId_lakala_serial_settle_date: {
            merchantId,
            lakala_serial: serial,
            settle_date: settleDate,
          },
        },
        update: {
          amount: BigInt(record.amount || 0),
          fee: BigInt(record.fee || 0),
          settle_amount: BigInt(record.settle_amount || record.settleAmount || 0),
          settle_status: Number(record.settle_status || record.settleStatus || 0),
        },
        create: {
          merchantId,
          trans_date: record.trans_date || record.transDate || '',
          trans_time: record.trans_time || record.transTime || null,
          terminal_no: record.terminal_no || record.terminalNo || null,
          lakala_serial: serial,
          amount: BigInt(record.amount || 0),
          fee: BigInt(record.fee || 0),
          settle_amount: BigInt(record.settle_amount || record.settleAmount || 0),
          settle_date: settleDate,
          settle_status: Number(record.settle_status || record.settleStatus || 0),
        },
      });
    }
    return records.length;
  }

  private async saveJzSettlements(merchantId: string, records: any[]): Promise<number> {
    for (const record of records) {
      const settleDate = record.settle_date || record.settleDate || '';
      const walletType = record.wallet_type || record.walletType || '';
      await this.prisma!.jzWalletSettlement.upsert({
        where: {
          merchantId_settle_date_wallet_type: {
            merchantId,
            settle_date: settleDate,
            wallet_type: walletType,
          },
        },
        update: {
          amount: BigInt(record.amount || 0),
          fee: BigInt(record.fee || 0),
          settle_amount: BigInt(record.settle_amount || record.settleAmount || 0),
        },
        create: {
          merchantId,
          settle_date: settleDate,
          wallet_type: walletType,
          amount: BigInt(record.amount || 0),
          fee: BigInt(record.fee || 0),
          settle_amount: BigInt(record.settle_amount || record.settleAmount || 0),
        },
      });
    }
    return records.length;
  }

  private async saveAccSettlements(merchantId: string, records: any[]): Promise<number> {
    for (const record of records) {
      const accountNo = record.account_no || record.accountNo || '';
      const settleDate = record.settle_date || record.settleDate || '';
      await this.prisma!.accAccountSettlement.upsert({
        where: {
          merchantId_account_no_settle_date: {
            merchantId,
            account_no: accountNo,
            settle_date: settleDate,
          },
        },
        update: {
          amount: BigInt(record.amount || 0),
          fee: BigInt(record.fee || 0),
          settle_amount: BigInt(record.settle_amount || record.settleAmount || 0),
        },
        create: {
          merchantId,
          account_no: accountNo,
          settle_date: settleDate,
          amount: BigInt(record.amount || 0),
          fee: BigInt(record.fee || 0),
          settle_amount: BigInt(record.settle_amount || record.settleAmount || 0),
        },
      });
    }
    return records.length;
  }

  private async saveSepTransactions(merchantId: string, records: any[]): Promise<number> {
    for (const record of records) {
      const serial = record.lakala_serial || record.lakalaSerial || '';
      await this.prisma!.sepTransaction.upsert({
        where: {
          merchantId_lakala_serial: { merchantId, lakala_serial: serial },
        },
        update: {
          amount: BigInt(record.amount || 0),
          sep_amount: BigInt(record.sep_amount || record.sepAmount || 0),
          sep_rate: Number(record.sep_rate || record.sepRate || 0),
        },
        create: {
          merchantId,
          trans_date: record.trans_date || record.transDate || '',
          lakala_serial: serial,
          amount: BigInt(record.amount || 0),
          sep_amount: BigInt(record.sep_amount || record.sepAmount || 0),
          sep_rate: Number(record.sep_rate || record.sepRate || 0),
        },
      });
    }
    return records.length;
  }

  private async saveDwWithdrawals(merchantId: string, records: any[]): Promise<number> {
    for (const record of records) {
      const serial = record.withdraw_serial || record.withdrawSerial || record.lakala_serial || record.lakalaSerial || '';
      await this.prisma!.dwWithdrawal.upsert({
        where: {
          merchantId_withdraw_serial: { merchantId, withdraw_serial: serial },
        },
        update: {
          amount: BigInt(record.amount || 0),
          fee: BigInt(record.fee || 0),
          status: Number(record.status || 0),
        },
        create: {
          merchantId,
          withdraw_date: record.withdraw_date || record.withdrawDate || '',
          withdraw_serial: serial,
          amount: BigInt(record.amount || 0),
          fee: BigInt(record.fee || 0),
          status: Number(record.status || 0),
        },
      });
    }
    return records.length;
  }

  private async saveD0Withdrawals(merchantId: string, records: any[]): Promise<number> {
    for (const record of records) {
      const serial = record.lakala_serial || record.lakalaSerial || '';
      await this.prisma!.d0Withdrawal.upsert({
        where: {
          merchantId_lakala_serial: { merchantId, lakala_serial: serial },
        },
        update: {
          amount: BigInt(record.amount || 0),
          fee: BigInt(record.fee || 0),
          d0_fee: BigInt(record.d0_fee || record.d0Fee || 0),
        },
        create: {
          merchantId,
          trans_date: record.trans_date || record.transDate || '',
          lakala_serial: serial,
          amount: BigInt(record.amount || 0),
          fee: BigInt(record.fee || 0),
          d0_fee: BigInt(record.d0_fee || record.d0Fee || 0),
        },
      });
    }
    return records.length;
  }

  private async saveJyInstallments(merchantId: string, records: any[]): Promise<number> {
    for (const record of records) {
      const serial = record.lakala_serial || record.lakalaSerial || '';
      await this.prisma!.jyInstallment.upsert({
        where: {
          merchantId_lakala_serial: { merchantId, lakala_serial: serial },
        },
        update: {
          amount: BigInt(record.amount || 0),
          installment_count: Number(record.installment_count || record.installmentCount || 0),
          per_amount: BigInt(record.per_amount || record.perAmount || 0),
        },
        create: {
          merchantId,
          trans_date: record.trans_date || record.transDate || '',
          lakala_serial: serial,
          amount: BigInt(record.amount || 0),
          installment_count: Number(record.installment_count || record.installmentCount || 0),
          per_amount: BigInt(record.per_amount || record.perAmount || 0),
        },
      });
    }
    return records.length;
  }

  private async saveBusinessOrders(merchantId: string, records: any[], fileId?: string): Promise<number> {
    for (const record of records) {
      const orderNo = record.order_no || '';
      const transDate = record.trans_date || '';

      await this.prisma!.businessOrder.upsert({
        where: { order_no: orderNo },
        update: {
          order_type: record.order_type || '',
          pay_method: record.pay_method || '',
          channel_name: record.channel_name || '',
          customer_phone: record.customer_phone || null,
          customer_name: record.customer_name || null,
          order_amount: BigInt(record.order_amount || 0),
          received_amount: BigInt(record.received_amount || 0),
          paid_amount: BigInt(record.paid_amount || 0),
          channel_fee: BigInt(record.channel_fee || 0),
          order_status: record.order_status || '',
          pay_serial_no: record.pay_serial_no || null,
          orig_serial_no: record.orig_serial_no || null,
          trans_date: transDate,
          file_id: fileId || null,
        },
        create: {
          merchant: { connect: { id: merchantId } },
          order_no: orderNo,
          order_type: record.order_type || '',
          pay_method: record.pay_method || '',
          channel_name: record.channel_name || '',
          customer_phone: record.customer_phone || null,
          customer_name: record.customer_name || null,
          order_amount: BigInt(record.order_amount || 0),
          received_amount: BigInt(record.received_amount || 0),
          paid_amount: BigInt(record.paid_amount || 0),
          channel_fee: BigInt(record.channel_fee || 0),
          order_status: record.order_status || '',
          pay_serial_no: record.pay_serial_no || null,
          orig_serial_no: record.orig_serial_no || null,
          trans_date: transDate,
          file_id: fileId || null,
        },
      });
    }
    return records.length;
  }
}

function detectFileTypeFromContent(content: string, filename: string, buffer?: Buffer): string | null {
  const businessOrderParser = FILE_PARSERS.BUSINESS_ORDER as BusinessOrderParser;
  const result = businessOrderParser.parse(content, filename, buffer);
  if (result.success && result.records.length > 0) {
    return 'BUSINESS_ORDER';
  }
  return null;
}

export function guessFileType(filename: string): string | null {
  const upper = filename.toUpperCase();

  if (upper.includes('ORDER') || upper.includes('璁㈠崟') || upper.includes('BUSINESS')) return 'BUSINESS_ORDER';
  if (upper.includes('JY_FQ') || upper.includes('JFQ')) return 'JY_FQ';
  if (upper.startsWith('JY_')) return 'JY';
  if (upper.startsWith('JS_')) return 'JS';
  if (upper.startsWith('JZ_')) return 'JZ';
  if (upper.startsWith('ACC_')) return 'ACC';
  if (upper.startsWith('SEP_SUM')) return 'SEP_SUM';
  if (upper.startsWith('SEP_')) return 'SEP';
  if (upper.startsWith('DW_')) return 'DW';
  if (upper.startsWith('D0_')) return 'D0';
  if (upper.endsWith('.PNG') || upper.endsWith('.JPG') || upper.endsWith('.JPEG')) return 'PROOF';

  return null;
}
