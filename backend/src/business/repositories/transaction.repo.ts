import { PrismaClient } from '@prisma/client';

export class TransactionRepository {
  constructor(private prisma: PrismaClient) {}

  async saveJyTransaction(merchantId: string, data: any, fileId?: string) {
    const merchant_order_no = data.merchant_order_no || data.lakala_serial || `jy_${data.trans_date}_${Date.now()}`;
    return this.prisma.jyTransaction.upsert({
      where: {
        merchantId_merchant_order_no: { merchantId, merchant_order_no },
      },
      update: {
        trans_date: data.trans_date,
        trans_time: data.trans_time,
        amount: BigInt(data.amount || 0),
        fee: BigInt(data.fee || 0),
        settle_amount: BigInt(data.settle_amount || 0),
        trans_type: data.trans_type,
        lakala_serial: data.lakala_serial,
        file_id: fileId || null,
      },
      create: {
        merchantId,
        merchant_order_no,
        trans_date: data.trans_date,
        trans_time: data.trans_time,
        terminal_no: data.terminal_no,
        branch_name: data.branch_name,
        trans_type: data.trans_type,
        lakala_serial: data.lakala_serial,
        orig_lakala_serial: data.orig_lakala_serial,
        card_no: data.card_no,
        pay_channel: data.pay_channel,
        bank_name: data.bank_name,
        amount: BigInt(data.amount || 0),
        fee: BigInt(data.fee || 0),
        settle_amount: BigInt(data.settle_amount || 0),
        pay_order_no: data.pay_order_no,
        external_serial: data.external_serial,
        sys_ref_no: data.sys_ref_no,
        remark: data.remark,
        pay_method: data.pay_method,
        file_id: fileId || null,
      },
    });
  }

  async list(merchantId: string, opts: { page?: number; pageSize?: number; transType?: string } = {}) {
    const page = Math.max(1, opts.page || 1);
    const pageSize = Math.min(100, Math.max(1, opts.pageSize || 20));
    const where: any = {};
    if (merchantId) where.merchantId = merchantId;
    if (opts.transType) where.trans_type = opts.transType;

    const [total, items] = await Promise.all([
      this.prisma.jyTransaction.count({ where }),
      this.prisma.jyTransaction.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { total, items, page, pageSize };
  }
}
