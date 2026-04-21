import { PrismaClient } from '@prisma/client';

export class InvoiceRepository {
  constructor(private prisma: PrismaClient) {}

  async create(data: any) {
    return this.prisma.invoice.create({ data });
  }

  async update(id: string, data: any) {
    return this.prisma.invoice.update({ where: { id }, data });
  }

  async findById(id: string) {
    return this.prisma.invoice.findUnique({ where: { id } });
  }

  async findByFileId(fileId: string) {
    return this.prisma.invoice.findUnique({ where: { file_id: fileId } });
  }

  async list(opts: { status?: number; page?: number; pageSize?: number } = {}) {
    const page = Math.max(1, opts.page || 1);
    const pageSize = Math.min(100, Math.max(1, opts.pageSize || 20));
    const where: any = {};
    if (opts.status !== undefined) where.status = opts.status;

    const [total, items] = await Promise.all([
      this.prisma.invoice.count({ where }),
      this.prisma.invoice.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { total, items, page, pageSize };
  }
}
