import type { ParseResult, JyTransaction } from '../types/parser.js';
import {
  parseCSV,
  parseExcelBuffer,
  parseTextByDelimiter,
  isExcelFile,
  type ParsedData,
} from '../utils/file-parser.js';

export class JyParser {
  private fieldMap: Record<string, string> = {
    '商户编号': 'merchant_no',
    '商户号': 'merchant_no',
    '支付宝账号': 'merchant_no',
    '交易日期': 'trans_date',
    '交易时间': 'trans_time',
    '业务时间': 'transaction_time',
    '账务时间': 'transaction_time',
    '交易创建时间': 'transaction_time',
    '完成时间': 'transaction_time',
    '终端号': 'terminal_no',
    '分支机构': 'branch_name',
    '网点名称': 'branch_name',
    '商品名称': 'branch_name',
    '门店名称': 'branch_name',
    '交易类型': 'trans_type',
    '账务类型': 'trans_type',
    '收支类型': 'trans_type',
    '业务类型': 'trans_type',
    '交易状态': 'remark',
    '拉卡拉流水号': 'lakala_serial',
    '交易流水号': 'lakala_serial',
    '微信订单号': 'lakala_serial',
    '支付宝交易号': 'lakala_serial',
    '平台订单号': 'lakala_serial',
    '抖音支付单号': 'lakala_serial',
    '原拉卡拉流水号': 'orig_lakala_serial',
    '原交易流水号': 'orig_lakala_serial',
    '微信退款单号': 'orig_lakala_serial',
    '原支付宝交易号': 'orig_lakala_serial',
    '卡号': 'card_no',
    '支付渠道': 'pay_channel',
    '公众账号ID': 'pay_channel',
    '渠道来源': 'pay_channel',
    '应用': 'pay_channel',
    '银行名称': 'bank_name',
    '付款银行': 'bank_name',
    '交易金额(分)': 'amount',
    '交易金额': 'amount',
    '订单金额': 'amount',
    '订单金额（元）': 'amount',
    '用户实付金额': 'amount',
    '收入金额': 'amount',
    '手续费(分)': 'fee',
    '手续费': 'fee',
    '服务费': 'fee',
    '服务费（元）': 'fee',
    '技术服务费': 'fee',
    '平台服务费': 'fee',
    '佣金': 'fee',
    '结算金额(分)': 'settle_amount',
    '结算金额': 'settle_amount',
    '应结订单金额': 'settle_amount',
    '入账金额': 'settle_amount',
    '净额': 'settle_amount',
    '商户订单号': 'merchant_order_no',
    '商家订单号': 'merchant_order_no',
    '业务订单号': 'merchant_order_no',
    '美团订单号': 'merchant_order_no',
    '支付订单号': 'pay_order_no',
    '支付端订单号': 'pay_order_no',
    '商户退款单号': 'pay_order_no',
    '退款请求号': 'pay_order_no',
    '外部流水号': 'external_serial',
    '系统参考号': 'sys_ref_no',
    '备注': 'remark',
    '费率备注': 'remark',
    '支付方式': 'pay_method',
    '退款类型': 'pay_method',
  };

  parse(content: string, filename?: string, buffer?: Buffer): ParseResult<JyTransaction> {
    if (!content && !buffer) {
      return { success: false, records: [], error: 'Content is empty' };
    }

    let data: ParsedData;

    if (buffer && filename && isExcelFile(filename)) {
      data = parseExcelBuffer(buffer);
    } else {
      const ext = filename?.toLowerCase().split('.').pop();
      if (ext === 'csv') {
        data = parseCSV(content);
      } else {
        data = parseTextByDelimiter(content);
      }
    }

    if (data.headers.length === 0) {
      return { success: false, records: [], error: 'Invalid header' };
    }

    const records: JyTransaction[] = [];
    for (let i = 0; i < data.rows.length; i++) {
      try {
        const record = this.mapToRecord(data.headers, data.rows[i]);
        if (record && this.validate(record)) {
          records.push(record);
        }
      } catch (error) {
        console.warn(`Row ${i + 1} parse error:`, error);
      }
    }

    return { success: true, records };
  }

  validate(record: Partial<JyTransaction>): boolean {
    const required = ['merchant_no', 'trans_date', 'lakala_serial', 'amount', 'fee', 'settle_amount'];
    return required.every((field) => record[field as keyof JyTransaction] !== undefined && record[field as keyof JyTransaction] !== '');
  }

  private mapToRecord(headers: string[], values: string[]): JyTransaction | null {
    const raw: Record<string, unknown> = {};
    const unitHints: Record<string, 'fen' | 'yuan' | undefined> = {};

    headers.forEach((header, index) => {
      const normalizedHeader = this.cleanText(header);
      const fieldName = this.fieldMap[normalizedHeader];
      if (fieldName && values[index] !== undefined) {
        raw[fieldName] = this.cleanText(values[index]);
        if (!unitHints[fieldName]) {
          unitHints[fieldName] = this.detectAmountUnitHint(normalizedHeader);
        }
      }
    });

    const transTimeRaw = this.cleanText(raw.trans_time);
    const transactionTimeRaw = this.cleanText(raw.transaction_time);
    const combinedDateTime = transactionTimeRaw || transTimeRaw;
    const derivedDate =
      raw.trans_date
        ? this.cleanText(raw.trans_date)
        : this.extractDate(combinedDateTime);
    const derivedTime =
      this.extractTime(transactionTimeRaw) ||
      this.extractTime(transTimeRaw) ||
      transTimeRaw;

    const amount = this.parseAmount(raw.amount, unitHints.amount);
    const fee = this.parseAmount(raw.fee, unitHints.fee);
    const settleAmount = this.parseAmount(raw.settle_amount, unitHints.settle_amount);

    return {
      merchant_no: String(raw.merchant_no || ''),
      trans_date: derivedDate,
      trans_time: derivedTime,
      terminal_no: raw.terminal_no ? String(raw.terminal_no) : undefined,
      branch_name: raw.branch_name ? String(raw.branch_name) : undefined,
      trans_type: raw.trans_type ? String(raw.trans_type) : undefined,
      lakala_serial: String(raw.lakala_serial || ''),
      orig_lakala_serial: raw.orig_lakala_serial ? String(raw.orig_lakala_serial) : undefined,
      card_no: raw.card_no ? String(raw.card_no) : undefined,
      pay_channel: raw.pay_channel ? String(raw.pay_channel) : undefined,
      bank_name: raw.bank_name ? String(raw.bank_name) : undefined,
      amount,
      fee,
      settle_amount: settleAmount,
      merchant_order_no: raw.merchant_order_no ? String(raw.merchant_order_no) : undefined,
      pay_order_no: raw.pay_order_no ? String(raw.pay_order_no) : undefined,
      external_serial: raw.external_serial ? String(raw.external_serial) : undefined,
      sys_ref_no: raw.sys_ref_no ? String(raw.sys_ref_no) : undefined,
      remark: raw.remark ? String(raw.remark) : undefined,
      pay_method: raw.pay_method ? String(raw.pay_method) : undefined,
    };
  }

  private cleanText(value: unknown): string {
    return String(value || '').replace(/`/g, '').trim();
  }

  private extractDate(value: string): string {
    const cleaned = this.cleanText(value);
    if (!cleaned) {
      return '';
    }
    if (cleaned.includes(' ')) {
      return cleaned.split(' ')[0];
    }
    return cleaned;
  }

  private extractTime(value: string): string {
    const cleaned = this.cleanText(value);
    if (!cleaned || !cleaned.includes(' ')) {
      return '';
    }
    return cleaned.split(' ')[1] || '';
  }

  private detectAmountUnitHint(header: string): 'fen' | 'yuan' | undefined {
    const normalized = this.cleanText(header).toLowerCase();
    if (!normalized) return undefined;
    if (normalized.includes('(分') || normalized.includes('（分') || normalized.endsWith('分')) {
      return 'fen';
    }
    if (normalized.includes('(元') || normalized.includes('（元') || normalized.includes('元')) {
      return 'yuan';
    }
    return undefined;
  }

  private parseAmount(value: unknown, unitHint?: 'fen' | 'yuan'): number {
    if (!value && value !== 0) {
      return 0;
    }

    const str = this.cleanText(value).replace(/[,，]/g, '');
    const num = parseFloat(str);
    if (Number.isNaN(num)) {
      return 0;
    }

    if (unitHint === 'fen') {
      return Math.round(num);
    }
    if (unitHint === 'yuan') {
      return Math.round(num * 100);
    }

    if (str.includes('.') || Math.abs(num) < 10000) {
      return Math.round(num * 100);
    }

    return Math.round(num);
  }
}
