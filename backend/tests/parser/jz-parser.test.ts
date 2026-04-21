import { describe, it, expect } from 'vitest';
import { JzParser } from '../../src/parser/jz-parser.js';

describe('JzParser', () => {
  const parser = new JzParser();

  it('should parse valid content', () => {
    const content = `商户编号|结算日期|钱包类型|交易金额(分)|手续费(分)|结算金额(分)
M001|2024-01-01|微信|10000|50|9950
M002|2024-01-01|支付宝|20000|100|19900`;

    const result = parser.parse(content);

    expect(result.success).toBe(true);
    expect(result.records).toHaveLength(2);
    expect(result.records[0]).toEqual({
      merchant_no: 'M001',
      settle_date: '2024-01-01',
      wallet_type: '微信',
      amount: 10000,
      fee: 50,
      settle_amount: 9950,
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
      settle_date: '2024-01-01',
      wallet_type: '微信',
      amount: 10000,
      fee: 50,
      settle_amount: 9950,
    };
    expect(parser.validate(validRecord)).toBe(true);

    const invalidRecord = {
      merchant_no: 'M001',
      settle_date: '2024-01-01',
    };
    expect(parser.validate(invalidRecord)).toBe(false);
  });
});
