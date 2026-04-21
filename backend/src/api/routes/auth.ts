/**
 * 登录 API
 * POST /auth/login          — 登录（手机号 + 密码）
 * GET  /auth/me             — 获取当前用户信息
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

export const createAuthRoutes = (prismaClient: PrismaClient): FastifyPluginAsync => {
  prisma = prismaClient;
  return authRoutes;
};

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  /** 登录 */
  fastify.post('/auth/login', async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const phone = body.phone as string;
    const password = body.password as string;

    if (!phone || !password) {
      return reply.status(400).send(err(1, 'phone and password are required'));
    }

    const user = await prisma.user.findUnique({
      where: { phone },
      include: { merchant: true },
    });

    if (!user || user.password !== password) {
      return reply.status(401).send(err(2, 'Invalid phone or password'));
    }

    if (user.status !== 1) {
      return reply.status(403).send(err(3, 'User is disabled'));
    }

    return ok({
      user: {
        id: user.id,
        phone: user.phone,
        name: user.name,
        merchantId: user.merchantId,
        merchantName: user.merchant?.name || null,
      },
    });
  });

  /** 获取当前用户信息（Mock: 从 header X-User-Id 获取） */
  fastify.get('/auth/me', async (request, reply) => {
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
};
