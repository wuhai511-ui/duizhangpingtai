/**
 * 用户相关 API（仅 /merchants/available）
 * GET /merchants/available — 获取可选门店列表
 */
import type { FastifyPluginAsync } from 'fastify';
import type { PrismaClient } from '@prisma/client';

interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data: T;
}

function ok<T>(data: T): ApiResponse<T> {
  return { code: 0, message: 'success', data };
}

let prisma: PrismaClient;

export const createUserRoutes = (prismaClient: PrismaClient): FastifyPluginAsync => {
  prisma = prismaClient;
  return userRoutes;
};

export const userRoutes: FastifyPluginAsync = async (fastify) => {
  /** 获取可选门店列表 */
  fastify.get('/merchants/available', async (request) => {
    const merchants = await prisma.merchant.findMany({
      where: { status: 1 },
      orderBy: { created_at: 'asc' },
    });

    return ok({
      list: merchants.map(m => ({
        merchantId: m.id,
        merchantNo: m.merchant_no,
        name: m.name,
      })),
    });
  });
};
