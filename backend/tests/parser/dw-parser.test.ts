import { describe, it, expect } from 'vitest';
import { DwParser } from '../../src/parser/dw-parser.js';

describe('DwParser', () => {
  const parser = new DwParser();

  it('should parse valid content', () => {
    const content = `商户编号|提现日期|提现流水号|提现金额(分)|手续费(分)|状态
M001|2024-01-01|W001|10000|50|1
M002|2024-01-01|W002|20000|100|1`;

    const result = parser.parse(content);

    expect(result.success).toBe(true);
    expect(result.records).toHaveLength(2);
    expect(result.records[0]).toEqual({
      merchant_no: 'M001',
      withdraw_date: '2024-01-01',
      withdraw_serial: 'W001',
      amount: 10000,
      fee: 50,
      status: 1,
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
      withdraw_date: '2024-01-01',
      withdraw_serial: 'W001',
      amount: 10000,
      fee: 50,
      status: 1,
    };
    expect(parser.validate(validRecord)).toBe(true);

    const invalidRecord = {
      merchant_no: 'M001',
      withdraw_date: '2024-01-01',
    };
    expect(parser.validate(invalidRecord)).toBe(false);
  });
});
