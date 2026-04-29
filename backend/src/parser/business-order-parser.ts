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
    '订单id': 'orig_serial_no',
    '订单Id': 'orig_serial_no',
    '订单ID': 'orig_serial_no',
    '确认号': 'order_no',
    '子单号': 'order_no',
    '订单类型': 'order_type',
    '来源': 'order_type',
    '是否闪住': 'order_type',
    '支付方式': 'pay_method',
    '协议公司': 'pay_method',
    '付底付面': 'pay_method',
    '渠道名称': 'channel_name',
    '网点名称': 'channel_name',
    '下单酒店名称': 'channel_name',
    '下单酒店ID': 'channel_name',
    '房型名称': 'channel_name',
    '顾客手机号': 'customer_phone',
    '顾客姓名': 'customer_name',
    '入住者': 'customer_name',
    '订单金额': 'order_amount',
    'PMS金额': 'order_amount',
    '订单面价': 'order_amount',
    '实收金额': 'received_amount',
    '结算金额': 'received_amount',
    '结算价': 'received_amount',
    '实付金额': 'paid_amount',
    '交易金额': 'paid_amount',
    '酒店对携程开票金额': 'paid_amount',
    '通道手续费': 'channel_fee',
    '手续费': 'channel_fee',
    '佣金': 'channel_fee',
    '携程对酒店开票金额': 'channel_fee',
    '订单状态': 'order_status',
    '订单是否金蝉': 'order_status',
    '支付流水号': 'pay_serial_no',
    '交易流水号': 'pay_serial_no',
    '父单号': 'orig_serial_no',
    '原交易流水号': 'orig_serial_no',
    '中介单号': 'orig_serial_no',
    '交易日期': 'trans_date',
    '结账日期': 'trans_date',
    '入住时间': 'trans_date',
    '离店时间': 'trans_date',
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
      const normalizedHeader = this.normalizeHeader(header);
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

    const orderNo = this.cleanText(raw.order_no);
    const transDate =
      this.extractDate(raw.trans_date) ||
      this.extractDate(raw.order_time) ||
      this.extractDate(raw.check_in_time);
    const receivedAmount = parseAmount(raw.received_amount);
    const channelFee = parseAmount(raw.channel_fee);
    const paidAmount = parseAmount(raw.paid_amount) || receivedAmount;

    return {
      order_no: orderNo,
      order_type: this.cleanText(raw.order_type),
      pay_method: this.cleanText(raw.pay_method),
      channel_name: this.cleanText(raw.channel_name),
      customer_phone: raw.customer_phone ? this.cleanText(raw.customer_phone) : undefined,
      customer_name: raw.customer_name ? this.cleanText(raw.customer_name) : undefined,
      order_amount: parseAmount(raw.order_amount),
      received_amount: receivedAmount || paidAmount,
      paid_amount: paidAmount,
      channel_fee: channelFee,
      order_status: this.cleanText(raw.order_status),
      pay_serial_no: raw.pay_serial_no ? this.cleanText(raw.pay_serial_no) : undefined,
      orig_serial_no: raw.orig_serial_no ? this.cleanText(raw.orig_serial_no) : undefined,
      trans_date: transDate,
    };
  }

  private cleanText(value: unknown): string {
    return String(value || '').replace(/^\uFEFF/, '').trim();
  }

  private normalizeHeader(value: unknown): string {
    return this.cleanText(value).replace(/\s+/g, '');
  }

  private extractDate(value: unknown): string | undefined {
    const text = this.cleanText(value);
    if (!text) return undefined;

    const match = text.match(/(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
    if (!match) {
      return text || undefined;
    }

    const [, year, month, day] = match;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
}
