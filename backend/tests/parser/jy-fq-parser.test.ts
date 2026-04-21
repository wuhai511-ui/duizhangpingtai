import { describe, it, expect } from 'vitest';
import { JyFqParser } from '../../src/parser/jy-fq-parser.js';

describe('JyFqParser', () => {
  const parser = new JyFqParser();

  it('should parse valid content', () => {
    const content = `商户编号|交易日期|拉卡拉流水号|交易金额(分)|分期数|每期金额(分)
M001|2024-01-01|L001|30000|3|10000
M002|2024-01-01|L002|60000|6|10000`;

    const result = parser.parse(content);

    expect(result.success).toBe(true);
    expect(result.records).toHaveLength(2);
    expect(result.records[0]).toEqual({
      merchant_no: 'M001',
      trans_date: '2024-01-01',
      lakala_serial: 'L001',
      amount: 30000,
      installment_count: 3,
      per_amount: 10000,
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
      amount: 30000,
      installment_count: 3,
      per_amount: 10000,
    };
    expect(parser.validate(validRecord)).toBe(true);

    const invalidRecord = {
      merchant_no: 'M001',
      trans_date: '2024-01-01',
    };
    expect(parser.validate(invalidRecord)).toBe(false);
  });
});
