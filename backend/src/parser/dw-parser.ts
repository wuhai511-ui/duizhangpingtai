import type { ParseResult, DwWithdrawal } from '../types/parser.js';
import { BaseParser } from './base-parser.js';

export class DwParser extends BaseParser<DwWithdrawal> {
  protected fieldMap: Record<string, string> = {
    '商户编号': 'merchant_no',
    '提现日期': 'withdraw_date',
    '提现流水号': 'withdraw_serial',
    '提现金额(分)': 'amount',
    '手续费(分)': 'fee',
    '状态': 'status',
  };

  parse(content: string): ParseResult<DwWithdrawal> {
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

    const records: DwWithdrawal[] = [];
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

  validate(record: Partial<DwWithdrawal>): boolean {
    const required = ['merchant_no', 'withdraw_date', 'withdraw_serial', 'amount', 'fee', 'status'];
    return required.every(field => record[field as keyof DwWithdrawal] !== undefined && record[field as keyof DwWithdrawal] !== '');
  }

  private convertRecord(raw: Record<string, unknown>): DwWithdrawal | null {
    return {
      merchant_no: String(raw.merchant_no || ''),
      withdraw_date: String(raw.withdraw_date || ''),
      withdraw_serial: String(raw.withdraw_serial || ''),
      amount: this.parseNumber(String(raw.amount || '0')),
      fee: this.parseNumber(String(raw.fee || '0')),
      status: this.parseNumber(String(raw.status || '0')),
    };
  }
}
