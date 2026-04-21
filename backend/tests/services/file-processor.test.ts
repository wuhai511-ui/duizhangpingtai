import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FileProcessor, guessFileType } from '../../src/services/file-processor';

const mockPool = {
  query: vi.fn().mockResolvedValue({ rows: [] }),
  connect: async () => ({
    query: async () => ({ rows: [] }),
    release: () => {},
  }),
  end: async () => {},
};

describe('guessFileType', () => {
  it('识别所有已知文件类型', () => {
    expect(guessFileType('JY_20240115.txt')).toBe('JY');
    expect(guessFileType('JS_20240115.csv')).toBe('JS');
    expect(guessFileType('JZ_20240115.txt')).toBe('JZ');
    expect(guessFileType('ACC_20240115.txt')).toBe('ACC');
    expect(guessFileType('SEP_20240115.txt')).toBe('SEP');
    expect(guessFileType('SEP_SUM_20240115.txt')).toBe('SEP_SUM');
    expect(guessFileType('DW_20240115.txt')).toBe('DW');
    expect(guessFileType('D0_20240115.txt')).toBe('D0');
    expect(guessFileType('JY_FQ_20240115.txt')).toBe('JY_FQ');
  });

  it('未知类型返回 null', () => {
    expect(guessFileType('unknown.txt')).toBe(null);
    expect(guessFileType('REPORT_20240115.csv')).toBe(null);
  });
});

describe('FileProcessor', () => {
  let processor: FileProcessor;

  beforeEach(() => {
    vi.clearAllMocks();
    processor = new FileProcessor(mockPool as any);
  });

  describe('processBuffer', () => {
    it('JY 文件解析成功', async () => {
      // JY parser 使用 | 分隔符，表头行 + 数据行
      const content = `商户编号|交易日期|交易时间|终端号|分支机构|交易类型|拉卡拉流水号|原拉卡拉流水号|卡号|支付渠道|银行名称|交易金额(分)|手续费(分)|结算金额(分)|商户订单号|支付订单号|外部流水号|系统参考号|备注|支付方式
M001|20240115|103000|800001|分行一|消费|LAKALA001||6222***1234|微信|工商银行|10000|100|9900|M20240115001|P20240115001|REF001|SYS001|备注|JSAPI`;
      const result = await processor.processBuffer(content, 'JY_20240115.txt', 'sftp');
      expect(result.success).toBe(true);
      expect(result.records).toBeGreaterThan(0);
    });

    it('未知文件类型返回错误', async () => {
      const result = await processor.processBuffer('some content', 'unknown.txt', 'api');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown');
    });

    it('空内容返回错误', async () => {
      const result = await processor.processBuffer('', 'JY_20240115.txt', 'upload');
      expect(result.success).toBe(false);
    });
  });

  describe('processFile', () => {
    it('processBuffer 是 processFile 的别名', async () => {
      const content = `商户编号|交易日期|交易时间|终端号|分支机构|交易类型|拉卡拉流水号|原拉卡拉流水号|卡号|支付渠道|银行名称|交易金额(分)|手续费(分)|结算金额(分)|商户订单号|支付订单号|外部流水号|系统参考号|备注|支付方式
M001|20240115|103000|800001|分行一|消费|LAKALA001||6222***1234|微信|工商银行|10000|100|9900|M20240115001|P20240115001|REF001|SYS001|备注|JSAPI`;
      const result = await processor.processFile(content, 'JY_20240115.txt', 'sftp');
      expect(result.success).toBe(true);
    });
  });
});
