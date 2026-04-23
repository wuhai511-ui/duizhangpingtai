import { PrismaClient } from '@prisma/client';
import type { Pool } from '../../shared/types/database.js';
import { AccParser } from '../../parser/acc-parser.js';
import { BusinessOrderParser } from '../../parser/business-order-parser.js';
import { D0Parser } from '../../parser/d0-parser.js';
import { DwParser } from '../../parser/dw-parser.js';
import { JsParser } from '../../parser/js-parser.js';
import { JyFqParser } from '../../parser/jy-fq-parser.js';
import { JyParser } from '../../parser/jy-parser.js';
import { JzParser } from '../../parser/jz-parser.js';
import { SepParser } from '../../parser/sep-parser.js';
import { TransactionRepository } from '../repositories/transaction.repo.js';
import { SettlementRepository } from '../repositories/settlement.repo.js';
import { detectSource, getSupportedSources, type SourceKind } from '../../utils/source-detector.js';
import { parseFileContent, parseExcelBuffer, isExcelFile } from '../../utils/file-parser.js';

export interface ProcessResult {
  success: boolean;
  records: number;
  type?: string;
  error?: string;
  fileId?: string;
  source_label?: string;
  source_kind?: SourceKind;
}

type FileSource = 'sftp' | 'upload' | 'api';

export interface FileMeta {
  id: string;
  filename: string;
  type: string;
  source: string;
  records: number;
  createdAt: string;
  source_label?: string;
  source_kind?: SourceKind;
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
  private transactionRepo: TransactionRepository | null = null;
  private settlementRepo: SettlementRepository | null = null;
  private files = new Map<string, FileMeta>();
  private fileRecords = new Map<string, unknown[]>();
  private defaultMerchantId: string | null = null;

  constructor(private pool: Pool) {
    void this.pool;
  }

  setPrisma(prisma: PrismaClient): void {
    this.prisma = prisma;
    this.transactionRepo = new TransactionRepository(prisma);
    this.settlementRepo = new SettlementRepository(prisma);
  }

  getPrisma(): PrismaClient | null {
    return this.prisma;
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

    // 来源识别：解析表头用于来源检测
    let headers: string[] = [];
    try {
      if (buffer && filename && isExcelFile(filename)) {
        const parsed = parseExcelBuffer(buffer);
        headers = parsed.headers;
      } else if (content) {
        const parsed = parseFileContent(content, filename);
        headers = parsed.headers;
      }
    } catch {
      // 解析表头失败不影响主流程
    }
    const sourceDetection = detectSource(filename, headers);

    const fileId = `${fileType}_${Date.now()}`;
    let savedCount = parseResult.records.length;

    try {
      if (this.prisma) {
        const effectiveMerchantId = await this.resolveMerchantId(merchantId);
        if (!effectiveMerchantId) {
          return { success: false, records: 0, error: 'merchantId is required' };
        }
        savedCount = await this.saveRecords(fileType, parseResult.records, fileId, effectiveMerchantId);
        // 持久化文件记录（含来源标签）
        await this.saveFileRecord({
          fileId,
          filename,
          fileType,
          source,
          sourceLabel: sourceDetection.source_label,
          sourceKind: sourceDetection.source_kind,
          recordCount: savedCount,
          merchantId: effectiveMerchantId,
          headersJson: headers.length > 0 ? JSON.stringify(headers) : null,
        });
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
      source_label: sourceDetection.source_label,
      source_kind: sourceDetection.source_kind,
    });

    if (parseResult.records.length > 0) {
      this.fileRecords.set(fileId, parseResult.records);
    }

    return {
      success: true,
      records: savedCount,
      type: fileType,
      fileId,
      source_label: sourceDetection.source_label,
      source_kind: sourceDetection.source_kind,
    };
  }

  async processFile(content: string, filename: string, source: FileSource): Promise<ProcessResult> {
    return this.processBuffer(content, filename, source);
  }

  async saveImportedBusinessOrders(
    filename: string,
    records: any[],
    source: FileSource,
    headers: string[] = [],
    merchantId?: string,
  ): Promise<ProcessResult> {
    if (!records.length) {
      return { success: false, records: 0, error: 'No valid records generated from template' };
    }

    const sourceDetection = detectSource(filename, headers);
    const fileId = `BUSINESS_ORDER_${Date.now()}`;
    let savedCount = records.length;

    try {
      if (this.prisma) {
        const effectiveMerchantId = await this.resolveMerchantId(merchantId);
        if (!effectiveMerchantId) {
          return { success: false, records: 0, error: 'merchantId is required' };
        }
        savedCount = await this.saveRecords('BUSINESS_ORDER', records, fileId, effectiveMerchantId);
        await this.saveFileRecord({
          fileId,
          filename,
          fileType: 'BUSINESS_ORDER',
          source,
          sourceLabel: sourceDetection.source_label,
          sourceKind: sourceDetection.source_kind,
          recordCount: savedCount,
          merchantId: effectiveMerchantId,
          headersJson: headers.length > 0 ? JSON.stringify(headers) : null,
        });
      }
    } catch (error) {
      return {
        success: false,
        records: 0,
        error: (error as Error).message || 'Save business orders failed',
      };
    }

    this.files.set(fileId, {
      id: fileId,
      filename,
      type: 'BUSINESS_ORDER',
      source,
      records: savedCount,
      createdAt: new Date().toISOString(),
      source_label: sourceDetection.source_label,
      source_kind: sourceDetection.source_kind,
    });

    this.fileRecords.set(fileId, records);

    return {
      success: true,
      records: savedCount,
      type: 'BUSINESS_ORDER',
      fileId,
      source_label: sourceDetection.source_label,
      source_kind: sourceDetection.source_kind,
    };
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
    if (!merchantId) {
      throw new Error('merchantId is required');
    }

    // merchantId 必须由调用方从登录态获取，不再内部创建
    const effectiveMerchantId = merchantId;

    switch (fileType) {
      case 'JY':
        return this.saveJyTransactions(effectiveMerchantId, records, fileId);
      case 'JS':
        return this.saveJsSettlements(effectiveMerchantId, records);
      case 'JZ':
        return this.saveJzSettlements(effectiveMerchantId, records);
      case 'ACC':
        return this.saveAccSettlements(effectiveMerchantId, records);
      case 'SEP':
        return this.saveSepTransactions(effectiveMerchantId, records);
      case 'DW':
        return this.saveDwWithdrawals(effectiveMerchantId, records);
      case 'D0':
        return this.saveD0Withdrawals(effectiveMerchantId, records);
      case 'JY_FQ':
        return this.saveJyInstallments(effectiveMerchantId, records);
      case 'BUSINESS_ORDER':
        return this.saveBusinessOrders(effectiveMerchantId, records, fileId);
      default:
        return records.length;
    }
  }

  private async saveJyTransactions(merchantId: string, records: any[], fileId?: string): Promise<number> {
    for (const record of records) {
      await this.transactionRepo!.saveJyTransaction(merchantId, record, fileId);
    }
    return records.length;
  }

  private async saveJsSettlements(merchantId: string, records: any[]): Promise<number> {
    for (const record of records) {
      await this.settlementRepo!.saveJsSettlement(merchantId, record);
    }
    return records.length;
  }

  private async saveJzSettlements(merchantId: string, records: any[]): Promise<number> {
    for (const record of records) {
      await this.settlementRepo!.saveJzWalletSettlement(merchantId, record);
    }
    return records.length;
  }

  private async saveAccSettlements(merchantId: string, records: any[]): Promise<number> {
    for (const record of records) {
      await this.settlementRepo!.saveAccAccountSettlement(merchantId, record);
    }
    return records.length;
  }

  private async saveSepTransactions(merchantId: string, records: any[]): Promise<number> {
    for (const record of records) {
      await this.settlementRepo!.saveSepTransaction(merchantId, record);
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

  /** 分析文件来源（不上传，仅检测） */
  async analyzeSource(filename: string, content?: string, buffer?: Buffer): Promise<{
    detected_source: SourceKind;
    source_label: string;
    confidence: number;
    headers: string[];
    supported_sources: Array<{ kind: SourceKind; label: string }>;
  }> {
    let headers: string[] = [];

    try {
      if (buffer && isExcelFile(filename)) {
        const parsed = parseExcelBuffer(buffer);
        headers = parsed.headers;
      } else if (content) {
        const parsed = parseFileContent(content, filename);
        headers = parsed.headers;
      }
    } catch {
      // ignore
    }

    const detection = detectSource(filename, headers);

    return {
      detected_source: detection.source_kind,
      source_label: detection.source_label,
      confidence: detection.confidence,
      headers,
      supported_sources: getSupportedSources(),
    };
  }

  /** 获取文件列表（含来源标签，优先从数据库） */
  async listFilesAsync(opts: ListFilesOptions): Promise<{ items: FileMeta[]; total: number }> {
    if (this.prisma) {
      const where: any = { status: 1 };
      if (opts.fileType) where.file_type = opts.fileType;

      const total = await this.prisma.uploadedFile.count({ where });
      const rows = await this.prisma.uploadedFile.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: (opts.page - 1) * opts.pageSize,
        take: opts.pageSize,
      });

      const items: FileMeta[] = rows.map((r: any) => ({
        id: r.id,
        filename: r.filename,
        type: r.file_type,
        source: r.source,
        records: r.record_count,
        createdAt: r.created_at.toISOString(),
        source_label: r.source_label ?? undefined,
        source_kind: (r.source_kind as SourceKind) ?? undefined,
      }));

      return { items, total };
    }
    return this.listFiles(opts);
  }

  private async resolveMerchantId(merchantId?: string): Promise<string | undefined> {
    if (merchantId) {
      return merchantId;
    }
    if (!this.prisma) {
      return undefined;
    }
    if (this.defaultMerchantId) {
      return this.defaultMerchantId;
    }

    const merchant = await this.prisma.merchant.upsert({
      where: { merchant_no: 'DEFAULT' },
      update: {},
      create: {
        merchant_no: 'DEFAULT',
        name: 'Default Merchant',
        status: 1,
      },
    });
    this.defaultMerchantId = merchant.id;
    return merchant.id;
  }

  private async saveFileRecord(params: {
    fileId: string;
    filename: string;
    fileType: string;
    source: string;
    sourceLabel: string;
    sourceKind: SourceKind;
    recordCount: number;
    merchantId?: string;
    headersJson?: string | null;
  }): Promise<void> {
    if (!this.prisma) return;
    await this.prisma.uploadedFile.create({
      data: {
        id: params.fileId,
        filename: params.filename,
        file_type: params.fileType,
        source: params.source,
        source_label: params.sourceLabel,
        source_kind: params.sourceKind,
        record_count: params.recordCount,
        merchant_id: params.merchantId,
        headers_json: params.headersJson,
      },
    });
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
