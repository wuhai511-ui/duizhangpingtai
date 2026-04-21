import { PrismaClient } from '@prisma/client';

export class MerchantRepository {
  constructor(private prisma: PrismaClient) {}

  async findById(id: string) {
    return this.prisma.merchant.findUnique({ where: { id } });
  }

  async findByMerchantNo(merchantNo: string) {
    return this.prisma.merchant.findUnique({ where: { merchant_no: merchantNo } });
  }

  async findOrCreateDefault() {
    return this.prisma.merchant.upsert({
      where: { merchant_no: 'DEFAULT' },
      update: {},
      create: { merchant_no: 'DEFAULT', name: 'DEFAULT', status: 1 },
    });
  }

  async list(status?: number) {
    return this.prisma.merchant.findMany({
      where: status !== undefined ? { status } : {},
      orderBy: { created_at: 'asc' },
    });
  }

  async create(data: { merchant_no: string; name?: string; status?: number }) {
    return this.prisma.merchant.create({ data: { ...data, status: data.status ?? 1 } });
  }

  async update(id: string, data: { name?: string; status?: number }) {
    return this.prisma.merchant.update({ where: { id }, data });
  }

  async delete(id: string) {
    return this.prisma.merchant.delete({ where: { id } });
  }
}
