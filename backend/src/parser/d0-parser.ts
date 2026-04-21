import type { ParseResult, D0Withdrawal } from '../types/parser.js';
import { BaseParser } from './base-parser.js';

export class D0Parser extends BaseParser<D0Withdrawal> {
  protected fieldMap: Record<string, string> = {
    '商户编号': 'merchant_no',
    '交易日期': 'trans_date',
    '拉卡拉流水号': 'lakala_serial',
    '交易金额(分)': 'amount',
    '手续费(分)': 'fee',
    'D0手续费(分)': 'd0_fee',
  };

  parse(content: string): ParseResult<D0Withdrawal> {
    if (!content || content.trim().length === 0) {
      return { success: false, records: [], error: 'Content is empty' };
    }

    const lines = content.trim().split('\n');
    if (lines.length === 0) {
      return { success: false, records: [], error: 'No lines to parse' };
    }

    const headers = this.parseLine(lines[0]);
    if (headers.length === 0) {
      return { success: false, records: [], error: 'Invalid header' };
    }

    const records: D0Withdrawal[] = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      try {
        const values = this.parseLine(line);
        const rawRecord = this.mapToRecord(headers, values);
        const record = this.convertRecord(rawRecord);
        if (record && this.validate(record)) {
          records.push(record);
        }
      } catch (error) {
        console.warn(`Line ${i + 1} parse error:`, error);
      }
    }

    return { success: true, records };
  }

  validate(record: Partial<D0Withdrawal>): boolean {
    const required = ['merchant_no', 'trans_date', 'lakala_serial', 'amount', 'fee', 'd0_fee'];
    return required.every(field => record[field as keyof D0Withdrawal] !== undefined && record[field as keyof D0Withdrawal] !== '');
  }

  private convertRecord(raw: Record<string, unknown>): D0Withdrawal | null {
    return {
      merchant_no: String(raw.merchant_no || ''),
      trans_date: String(raw.trans_date || ''),
      lakala_serial: String(raw.lakala_serial || ''),
      amount: this.parseNumber(String(raw.amount || '0')),
      fee: this.parseNumber(String(raw.fee || '0')),
      d0_fee: this.parseNumber(String(raw.d0_fee || '0')),
    };
  }
}
