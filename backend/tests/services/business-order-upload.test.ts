import { describe, it, expect, vi } from 'vitest';
import { FileProcessor } from '../../src/services/file-processor.js';

describe('FileProcessor BUSINESS_ORDER persistence', () => {
  it('stores BUSINESS_ORDER with fallback trans_date and file_id', async () => {
    const merchantUpsert = vi.fn().mockResolvedValue({ id: 'merchant_001' });
    const businessOrderUpsert = vi.fn().mockResolvedValue({});

    // 构造完整的 Prisma mock 对象（符合 setPrisma 接口）
    const mockPrisma = {
      merchant: { upsert: merchantUpsert },
      businessOrder: { upsert: businessOrderUpsert },
    } as any;

    const processor = new FileProcessor({} as any);
    processor.setPrisma(mockPrisma);

    // 测试数据：管道分隔，金额单位是"分"（与列头(分)一致）
    const content = `订单编号|订单金额|实收金额|实付金额|通道手续费
ORD001|12345|12000|10000|345`;

    const result = await processor.processBuffer(content, 'orders.txt', 'upload', 'BUSINESS_ORDER');

    expect(result.success).toBe(true);
    expect(result.fileId).toBeDefined();
    expect(result.records).toBe(1);

    // 验证 DEFAULT 商户被 upsert
    expect(merchantUpsert).toHaveBeenCalledTimes(1);

    // 验证 BUSINESS_ORDER 被 upsert
    expect(businessOrderUpsert).toHaveBeenCalledTimes(1);

    const upsertCall = businessOrderUpsert.mock.calls[0][0];
    expect(upsertCall.where.order_no).toBe('ORD001');
    expect(upsertCall.create.order_no).toBe('ORD001');
    expect(upsertCall.create.trans_date).toBe(''); // 内容中无交易日期
    expect(upsertCall.create.file_id).toBe(result.fileId);
    expect(upsertCall.create.order_amount).toBe(12345n);
  });

  it('passes merchantId through to saveRecords', async () => {
    const merchantUpsert = vi.fn().mockResolvedValue(undefined);
    const businessOrderUpsert = vi.fn().mockResolvedValue({});

    const mockPrisma = {
      merchant: { upsert: merchantUpsert },
      businessOrder: { upsert: businessOrderUpsert },
    } as any;

    const processor = new FileProcessor({} as any);
    processor.setPrisma(mockPrisma);

    const content = `订单编号|订单金额
ORD002|5000`;

    await processor.processBuffer(content, 'orders2.txt', 'upload', 'BUSINESS_ORDER', undefined, 'merchant_custom_id');

    // 不应调用 merchant upsert（传了 merchantId）
    expect(merchantUpsert).toHaveBeenCalledTimes(0);
    expect(businessOrderUpsert).toHaveBeenCalledTimes(1);

    const upsertCall = businessOrderUpsert.mock.calls[0][0];
    expect(upsertCall.create.merchant).toEqual({ connect: { id: 'merchant_custom_id' } });
  });
});
