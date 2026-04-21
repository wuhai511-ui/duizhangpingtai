import type { ParseResult, JyInstallment } from '../types/parser.js';
import { BaseParser } from './base-parser.js';

export class JyFqParser extends BaseParser<JyInstallment> {
  protected fieldMap: Record<string, string> = {
    '商户编号': 'merchant_no',
    '交易日期': 'trans_date',
    '拉卡拉流水号': 'lakala_serial',
    '交易金额(分)': 'amount',
    '分期数': 'installment_count',
    '每期金额(分)': 'per_amount',
  };

  parse(content: string): ParseResult<JyInstallment> {
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

    const records: JyInstallment[] = [];
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

  validate(record: Partial<JyInstallment>): boolean {
    const required = ['merchant_no', 'trans_date', 'lakala_serial', 'amount', 'installment_count', 'per_amount'];
    return required.every(field => record[field as keyof JyInstallment] !== undefined && record[field as keyof JyInstallment] !== '');
  }

  private convertRecord(raw: Record<string, unknown>): JyInstallment | null {
    return {
      merchant_no: String(raw.merchant_no || ''),
      trans_date: String(raw.trans_date || ''),
      lakala_serial: String(raw.lakala_serial || ''),
      amount: this.parseNumber(String(raw.amount || '0')),
      installment_count: this.parseNumber(String(raw.installment_count || '0')),
      per_amount: this.parseNumber(String(raw.per_amount || '0')),
    };
  }
}
