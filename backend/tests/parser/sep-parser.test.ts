import { describe, it, expect } from 'vitest';
import { SepParser } from '../../src/parser/sep-parser.js';

describe('SepParser', () => {
  const parser = new SepParser();

  it('should parse valid content', () => {
    const content = `商户编号|交易日期|拉卡拉流水号|交易金额(分)|分账金额(分)|分账比例
M001|2024-01-01|L001|10000|1000|10
M002|2024-01-01|L002|20000|2000|10`;

    const result = parser.parse(content);

    expect(result.success).toBe(true);
    expect(result.records).toHaveLength(2);
    expect(result.records[0]).toEqual({
      merchant_no: 'M001',
      trans_date: '2024-01-01',
      lakala_serial: 'L001',
      amount: 10000,
      sep_amount: 1000,
      sep_rate: 10,
    });
  });

  it('should handle empty content', () => {
    const result = parser.parse('');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Content is empty');
  });

  it('should validate required fields', () => {
    const validRecord = {
      merchant_no: 'M001',
      trans_date: '2024-01-01',
      lakala_serial: 'L001',
      amount: 10000,
      sep_amount: 1000,
      sep_rate: 10,
    };
    expect(parser.validate(validRecord)).toBe(true);

    const invalidRecord = {
      merchant_no: 'M001',
      trans_date: '2024-01-01',
    };
    expect(parser.validate(invalidRecord)).toBe(false);
  });
});
