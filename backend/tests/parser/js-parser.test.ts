import { describe, it, expect } from 'vitest';
import { JsParser } from '../../src/parser/js-parser.js';

describe('JsParser', () => {
  const parser = new JsParser();

  it('should parse valid content', () => {
    const content = `商户编号|交易日期|交易时间|终端号|拉卡拉流水号|交易金额(分)|手续费(分)|结算金额(分)|结算日期|结算状态
M001|2024-01-01|10:00:00|T001|L001|100.00|0.50|99.50|2024-01-02|1
M002|2024-01-01|11:00:00|T002|L002|200.00|1.00|199.00|2024-01-02|1`;

    const result = parser.parse(content);

    expect(result.success).toBe(true);
    expect(result.records).toHaveLength(2);
    expect(result.records[0]).toEqual({
      merchant_no: 'M001',
      trans_date: '2024-01-01',
      trans_time: '10:00:00',
      terminal_no: 'T001',
      lakala_serial: 'L001',
      amount: 10000,
      fee: 50,
      settle_amount: 9950,
      settle_date: '2024-01-02',
      settle_status: 1,
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
      settle_amount: 9950,
      settle_date: '2024-01-02',
      settle_status: 1,
    };
    expect(parser.validate(validRecord)).toBe(true);

    const invalidRecord = {
      merchant_no: 'M001',
      trans_date: '2024-01-01',
    };
    expect(parser.validate(invalidRecord)).toBe(false);
  });
});
