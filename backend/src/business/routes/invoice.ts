/**
 * 电子发票 API
 * POST /invoices/ocr — OCR 识别发票
 * GET  /invoices     — 发票列表
 * GET  /invoices/:id — 发票详情
 */
import type { FastifyPluginAsync } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { recognizeInvoice } from '../../services/invoice-ocr.js';

interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data: T;
}

function ok<T>(data: T): ApiResponse<T> {
  return { code: 0, message: 'success', data };
}

function err(code: number, message: string) {
  return { code, message, data: null as unknown };
}

let prisma: PrismaClient;

export const createInvoiceRoutes = (prismaClient: PrismaClient): FastifyPluginAsync => {
  prisma = prismaClient;
  return invoiceRoutes;
};

export const invoiceRoutes: FastifyPluginAsync = async (fastify) => {
  /** 发票列表 */
  fastify.get('/invoices', async (request) => {
    const query = request.query as Record<string, unknown>;
    const page = Math.max(1, Number(query.page || 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize || 20)));
    const status = query.status as string | undefined;

    const where: any = {};
    if (status !== undefined) where.status = Number(status);

    const [total, items] = await Promise.all([
      prisma.invoice.count({ where }),
      prisma.invoice.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return ok({
      list: items.map((item: any) => ({
        ...item,
        amount: item.amount.toString(),
        tax_amount: item.tax_amount.toString(),
        total_amount: item.total_amount.toString(),
      })),
      pagination: { page, pageSize, total },
    });
  });

  /** 发票详情 */
  fastify.get('/invoices/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const invoice = await prisma.invoice.findUnique({
      where: { id },
    });

    if (!invoice) {
      return reply.status(404).send(err(4, 'Invoice not found'));
    }

    return ok({
      ...invoice,
      amount: invoice.amount.toString(),
      tax_amount: invoice.tax_amount.toString(),
      total_amount: invoice.total_amount.toString(),
    });
  });

  /** OCR 识别发票 */
  fastify.post('/invoices/ocr', async (request, reply) => {
    const file = await request.file();
    if (!file) {
      return reply.status(400).send(err(1, 'No file provided'));
    }

    const buffer = await file.toBuffer();
    const mimeType = file.mimetype || 'image/png';
    const base64 = buffer.toString('base64');

    // 创建发票记录（待识别状态）
    const fileId = `INV_${Date.now()}`;

    // 获取或创建默认商户
    const merchantNo = 'DEFAULT';
    const merchant = await prisma.merchant.upsert({
      where: { merchant_no: merchantNo },
      update: {},
      create: { merchant_no: merchantNo, name: merchantNo, status: 1 },
    });

    const invoice = await prisma.invoice.create({
      data: {
        merchantId: merchant.id,
        file_id: fileId,
        status: 0,
        amount: 0n,
        tax_amount: 0n,
        total_amount: 0n,
      },
    });

    try {
      const result = await recognizeInvoice(base64, mimeType);

      // 更新发票信息
      const updated = await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          invoice_no: result.invoice_no,
          invoice_code: result.invoice_code,
          buyer_name: result.buyer_name,
          buyer_tax_no: result.buyer_tax_no,
          seller_name: result.seller_name,
          seller_tax_no: result.seller_tax_no,
          amount: BigInt(result.amount),
          tax_amount: BigInt(result.tax_amount),
          total_amount: BigInt(result.total_amount),
          invoice_date: result.invoice_date,
          ocr_raw: result.raw_text || null,
          status: 1,
        },
      });

      return ok({
        ...updated,
        amount: updated.amount.toString(),
        tax_amount: updated.tax_amount.toString(),
        total_amount: updated.total_amount.toString(),
      });
    } catch (error) {
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          status: 2,
          ocr_raw: (error as Error).message,
        },
      });
      return reply.status(500).send(err(2, `OCR failed: ${(error as Error).message}`));
    }
  });
};
