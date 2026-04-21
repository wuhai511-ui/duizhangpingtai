import type { ParseResult, AccAccountSettlement } from '../types/parser.js';
import { BaseParser } from './base-parser.js';

export class AccParser extends BaseParser<AccAccountSettlement> {
  protected fieldMap: Record<string, string> = {
    '商户编号': 'merchant_no',
    '账户编号': 'account_no',
    '结算日期': 'settle_date',
    '交易金额(分)': 'amount',
    '手续费(分)': 'fee',
    '结算金额(分)': 'settle_amount',
  };

  parse(content: string): ParseResult<AccAccountSettlement> {
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

    const records: AccAccountSettlement[] = [];
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

  validate(record: Partial<AccAccountSettlement>): boolean {
    const required = ['merchant_no', 'account_no', 'settle_date', 'amount', 'fee', 'settle_amount'];
    return required.every(field => record[field as keyof AccAccountSettlement] !== undefined && record[field as keyof AccAccountSettlement] !== '');
  }

  private convertRecord(raw: Record<string, unknown>): AccAccountSettlement | null {
    return {
      merchant_no: String(raw.merchant_no || ''),
      account_no: String(raw.account_no || ''),
      settle_date: String(raw.settle_date || ''),
      amount: this.parseNumber(String(raw.amount || '0')),
      fee: this.parseNumber(String(raw.fee || '0')),
      settle_amount: this.parseNumber(String(raw.settle_amount || '0')),
    };
  }
}
