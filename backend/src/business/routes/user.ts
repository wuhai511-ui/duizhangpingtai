/**
 * 用户相关 API
 * GET  /merchants/available — 获取可选门店列表
 * POST /users/me/bind-merchant — 绑定门店
 * GET  /users/me/merchant — 获取当前绑定门店
 * GET  /users/me — 获取当前用户信息
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

function err(code: number, message: string) {
  return { code, message, data: null as unknown };
}

let prisma: PrismaClient;

export const createUserRoutes = (prismaClient: PrismaClient): FastifyPluginAsync => {
  prisma = prismaClient;
  return userRoutes;
};

export const userRoutes: FastifyPluginAsync = async (fastify) => {
  /** 获取当前用户信息 */
  fastify.get('/users/me', async (request, reply) => {
    const userId = request.headers['x-user-id'] as string;
    if (!userId) {
      return reply.status(401).send(err(1, 'Not authenticated'));
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { merchant: true },
    });

    if (!user) {
      return reply.status(404).send(err(2, 'User not found'));
    }

    return ok({
      id: user.id,
      phone: user.phone,
      name: user.name,
      merchantId: user.merchantId,
      merchantName: user.merchant?.name || null,
    });
  });

  /** 绑定门店 */
  fastify.post('/users/me/bind-merchant', async (request, reply) => {
    const userId = request.headers['x-user-id'] as string;
    if (!userId) {
      return reply.status(401).send(err(1, 'Not authenticated'));
    }

    const body = request.body as Record<string, unknown>;
    const merchantId = body.merchantId as string;
    if (!merchantId) {
      return reply.status(400).send(err(2, 'merchantId is required'));
    }

    const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } });
    if (!merchant) {
      return reply.status(404).send(err(3, 'Merchant not found'));
    }

    await prisma.user.update({
      where: { id: userId },
      data: { merchantId },
    });

    return ok({ merchantId, merchantName: merchant.name });
  });

  /** 获取当前绑定门店 */
  fastify.get('/users/me/merchant', async (request, reply) => {
    const userId = request.headers['x-user-id'] as string;
    if (!userId) {
      return reply.status(401).send(err(1, 'Not authenticated'));
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { merchant: true },
    });

    if (!user) {
      return reply.status(404).send(err(2, 'User not found'));
    }

    return ok({
      merchantId: user.merchantId,
      merchantName: user.merchant?.name || null,
      merchantNo: user.merchant?.merchant_no || null,
    });
  });

  /** 获取可选门店列表 */
  fastify.get('/merchants/available', async () => {
    const merchants = await prisma.merchant.findMany({
      where: { status: 1 },
      orderBy: { created_at: 'asc' },
    });

    return ok({
      list: merchants.map((m: any) => ({
        merchantId: m.id,
        merchantNo: m.merchant_no,
        name: m.name,
      })),
    });
  });
};
