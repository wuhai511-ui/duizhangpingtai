import type { ParseResult, JzWalletSettlement } from '../types/parser.js';
import { BaseParser } from './base-parser.js';

export class JzParser extends BaseParser<JzWalletSettlement> {
  protected fieldMap: Record<string, string> = {
    '商户编号': 'merchant_no',
    '结算日期': 'settle_date',
    '钱包类型': 'wallet_type',
    '交易金额(分)': 'amount',
    '手续费(分)': 'fee',
    '结算金额(分)': 'settle_amount',
  };

  parse(content: string): ParseResult<JzWalletSettlement> {
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

    const records: JzWalletSettlement[] = [];
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

  validate(record: Partial<JzWalletSettlement>): boolean {
    const required = ['merchant_no', 'settle_date', 'wallet_type', 'amount', 'fee', 'settle_amount'];
    return required.every(field => record[field as keyof JzWalletSettlement] !== undefined && record[field as keyof JzWalletSettlement] !== '');
  }

  private convertRecord(raw: Record<string, unknown>): JzWalletSettlement | null {
    return {
      merchant_no: String(raw.merchant_no || ''),
      settle_date: String(raw.settle_date || ''),
      wallet_type: String(raw.wallet_type || ''),
      amount: this.parseNumber(String(raw.amount || '0')),
      fee: this.parseNumber(String(raw.fee || '0')),
      settle_amount: this.parseNumber(String(raw.settle_amount || '0')),
    };
  }
}
