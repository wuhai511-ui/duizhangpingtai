import type { ParseResult, SepTransaction } from '../types/parser.js';
import { BaseParser } from './base-parser.js';

export class SepParser extends BaseParser<SepTransaction> {
  protected fieldMap: Record<string, string> = {
    '商户编号': 'merchant_no',
    '交易日期': 'trans_date',
    '拉卡拉流水号': 'lakala_serial',
    '交易金额(分)': 'amount',
    '分账金额(分)': 'sep_amount',
    '分账比例': 'sep_rate',
  };

  parse(content: string): ParseResult<SepTransaction> {
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

    const records: SepTransaction[] = [];
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

  validate(record: Partial<SepTransaction>): boolean {
    const required = ['merchant_no', 'trans_date', 'lakala_serial', 'amount', 'sep_amount', 'sep_rate'];
    return required.every(field => record[field as keyof SepTransaction] !== undefined && record[field as keyof SepTransaction] !== '');
  }

  private convertRecord(raw: Record<string, unknown>): SepTransaction | null {
    return {
      merchant_no: String(raw.merchant_no || ''),
      trans_date: String(raw.trans_date || ''),
      lakala_serial: String(raw.lakala_serial || ''),
      amount: this.parseNumber(String(raw.amount || '0')),
      sep_amount: this.parseNumber(String(raw.sep_amount || '0')),
      sep_rate: this.parseNumber(String(raw.sep_rate || '0')),
    };
  }
}
