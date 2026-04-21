import { describe, it, expect } from 'vitest';
import { D0Parser } from '../../src/parser/d0-parser.js';

describe('D0Parser', () => {
  const parser = new D0Parser();

  it('should parse valid content', () => {
    const content = `商户编号|交易日期|拉卡拉流水号|交易金额(分)|手续费(分)|D0手续费(分)
M001|2024-01-01|L001|10000|50|10
M002|2024-01-01|L002|20000|100|20`;

    const result = parser.parse(content);

    expect(result.success).toBe(true);
    expect(result.records).toHaveLength(2);
    expect(result.records[0]).toEqual({
      merchant_no: 'M001',
      trans_date: '2024-01-01',
      lakala_serial: 'L001',
      amount: 10000,
      fee: 50,
      d0_fee: 10,
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
      fee: 50,
      d0_fee: 10,
    };
    expect(parser.validate(validRecord)).toBe(true);

    const invalidRecord = {
      merchant_no: 'M001',
      trans_date: '2024-01-01',
    };
    expect(parser.validate(invalidRecord)).toBe(false);
  });
});
