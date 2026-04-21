import type { ParseResult } from '../types/parser.js';
import {
  parseCSV,
  parseExcelBuffer,
  parseTextByDelimiter,
  isExcelFile,
  type ParsedData,
} from '../utils/file-parser.js';

/**
 * 业务订单数据结构
 */
export interface BusinessOrder {
  order_no: string;
  order_type: string;
  pay_method: string;
  channel_name: string;
  customer_phone?: string;
  customer_name?: string;
  order_amount: number;
  received_amount: number;
  paid_amount: number;
  channel_fee: number;
  order_status: string;
  pay_serial_no?: string;
  orig_serial_no?: string;
  trans_date?: string;
}

export class BusinessOrderParser {
  private fieldMap: Record<string, string> = {
    '订单编号': 'order_no',
    '子单号': 'order_no',
    '订单类型': 'order_type',
    '来源': 'order_type',
    '支付方式': 'pay_method',
    '协议公司': 'pay_method',
    '渠道名称': 'channel_name',
    '网点名称': 'channel_name',
    '顾客手机号': 'customer_phone',
    '顾客姓名': 'customer_name',
    '订单金额': 'order_amount',
    'PMS金额': 'order_amount',
    '实收金额': 'received_amount',
    '结算金额': 'received_amount',
    '实付金额': 'paid_amount',
    '交易金额': 'paid_amount',
    '通道手续费': 'channel_fee',
    '手续费': 'channel_fee',
    '订单状态': 'order_status',
    '支付流水号': 'pay_serial_no',
    '交易流水号': 'pay_serial_no',
    '原交易流水号': 'orig_serial_no',
    '中介单号': 'orig_serial_no',
    '交易日期': 'trans_date',
    '结账日期': 'trans_date',
  };

  parse(content: string, filename?: string, buffer?: Buffer): ParseResult<BusinessOrder> {
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

    const records: BusinessOrder[] = [];
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

  validate(record: Partial<BusinessOrder>): boolean {
    return !!record.order_no && record.order_amount !== undefined;
  }

  private mapToRecord(headers: string[], values: string[]): BusinessOrder | null {
    const raw: Record<string, unknown> = {};

    headers.forEach((header, index) => {
      const normalizedHeader = String(header || '').trim();
      const fieldName = this.fieldMap[normalizedHeader];
      if (fieldName && values[index] !== undefined) {
        raw[fieldName] = values[index];
      }
    });

    const parseAmount = (value: unknown): number => {
      if (!value) return 0;
      const str = String(value).replace(/[,，]/g, '');
      const num = parseFloat(str);
      if (isNaN(num)) return 0;
      if (str.includes('.') || num < 10000) {
        return Math.round(num * 100);
      }
      return Math.round(num);
    };

    return {
      order_no: String(raw.order_no || ''),
      order_type: String(raw.order_type || ''),
      pay_method: String(raw.pay_method || ''),
      channel_name: String(raw.channel_name || ''),
      customer_phone: raw.customer_phone ? String(raw.customer_phone) : undefined,
      customer_name: raw.customer_name ? String(raw.customer_name) : undefined,
      order_amount: parseAmount(raw.order_amount),
      received_amount: parseAmount(raw.received_amount),
      paid_amount: parseAmount(raw.paid_amount),
      channel_fee: parseAmount(raw.channel_fee),
      order_status: String(raw.order_status || ''),
      pay_serial_no: raw.pay_serial_no ? String(raw.pay_serial_no) : undefined,
      orig_serial_no: raw.orig_serial_no ? String(raw.orig_serial_no) : undefined,
      trans_date: raw.trans_date ? String(raw.trans_date) : undefined,
    };
  }
}
