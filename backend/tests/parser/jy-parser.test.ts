import { describe, it, expect } from 'vitest';
import { JyParser } from '../../src/parser/jy-parser.js';

describe('JyParser', () => {
  const parser = new JyParser();

  describe('parse', () => {
    it('should parse valid JY file content', () => {
      const content = `商户编号|交易日期|交易时间|终端号|分支机构|交易类型|拉卡拉流水号|原拉卡拉流水号|卡号|支付渠道|银行名称|交易金额(分)|手续费(分)|结算金额(分)|商户订单号|支付订单号|外部流水号|系统参考号|备注|支付方式
123456789012345|2024-01-15|10:30:45|T001|北京分公司|消费|LK20240115001||6222****1234|支付宝|工商银行|100.00|0.50|99.50|ORDER001|PAY001|EXT001|SYS001||扫码`;

      const result = parser.parse(content);

      expect(result.success).toBe(true);
      expect(result.records).toHaveLength(1);
      expect(result.records[0]).toMatchObject({
        merchant_no: '123456789012345',
        trans_date: '2024-01-15',
        trans_time: '10:30:45',
        terminal_no: 'T001',
        lakala_serial: 'LK20240115001',
        amount: 10000,
        fee: 50,
        settle_amount: 9950,
      });
    });

    it('should handle empty content', () => {
      const result = parser.parse('');
      expect(result.success).toBe(false);
      expect(result.error).toContain('empty');
    });

    it('should handle header-only content', () => {
      const content = '商户编号|交易日期|交易时间|终端号';
      const result = parser.parse(content);
      expect(result.success).toBe(true);
      expect(result.records).toHaveLength(0);
    });

    it('should skip invalid lines', () => {
      const content = `商户编号|交易日期|交易时间|终端号|分支机构|交易类型|拉卡拉流水号|原拉卡拉流水号|卡号|支付渠道|银行名称|交易金额(分)|手续费(分)|结算金额(分)|商户订单号|支付订单号|外部流水号|系统参考号|备注|支付方式
123456789012345|2024-01-15|10:30:45|T001|北京分公司|消费|LK001||6222****1234|支付宝|工商银行|100.00|0.50|99.50|ORDER001|PAY001|EXT001|SYS001||扫码
invalid_line`;
      const result = parser.parse(content);
      expect(result.success).toBe(true);
      expect(result.records).toHaveLength(1);
    });

    it('should derive trans_date from trans_time when date column is missing', () => {
      const content = `商户号,交易时间,微信订单号,应结订单金额,手续费
8222900481601ZW,2025-06-13 16:50:08,4200002694202506134562336448,124.00,0.74`;

      const result = parser.parse(content, 'test渠道数据.csv');

      expect(result.success).toBe(true);
      expect(result.records).toHaveLength(1);
      expect(result.records[0]).toMatchObject({
        merchant_no: '8222900481601ZW',
        trans_date: '2025-06-13',
        trans_time: '16:50:08',
        lakala_serial: '4200002694202506134562336448',
        settle_amount: 12400,
        fee: 74,
      });
    });
  });

  describe('validate', () => {
    it('should validate required fields', () => {
      const record = {
        merchant_no: '123456789012345',
        trans_date: '2024-01-15',
        lakala_serial: 'LK001',
        amount: 10000,
        fee: 50,
        settle_amount: 9950,
      };
      expect(parser.validate(record)).toBe(true);
    });

    it('should reject missing merchant_no', () => {
      const record = {
        trans_date: '2024-01-15',
        lakala_serial: 'LK001',
        amount: 10000,
        fee: 50,
        settle_amount: 9950,
      };
      expect(parser.validate(record)).toBe(false);
    });
  });
});
