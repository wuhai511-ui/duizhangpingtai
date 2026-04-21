import type { FastifyPluginAsync } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { BffFileService } from '../services/bff-file.service.js';
import type { QztFileType } from '../adapters/qzt.adapter.js';

export function createBffRoutes(prisma: PrismaClient): FastifyPluginAsync {
  const bffService = new BffFileService(prisma);

  return async (fastify) => {
    // 钱账通文件接收
    fastify.post('/bff/files/ingest', async (request, reply) => {
      const body = request.body as any;

      const content = body.content || '';
      const filename = body.filename || 'qzt.dat';
      const merchantId = body.merchantId || request.headers['x-merchant-id'] as string;
      const fileType = (body.fileType || body.file_type) as QztFileType;

      if (!merchantId) {
        return reply.status(400).send({ code: 1, message: 'merchantId required', data: null });
      }

      if (!fileType) {
        return reply.status(400).send({ code: 2, message: 'fileType required (JY|JS|JZ|ACC|SEP|DW|D0|JY_FQ|BUSINESS_ORDER)', data: null });
      }

      // 校验 merchantId 归属：用户只能操作自己绑定的商户
      // 从请求头 x-user-id 获取登录用户 ID（由 auth 中间件设置）
      const userId = request.headers['x-user-id'] as string;
      if (userId) {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { merchantId: true },
        });
        if (!user) {
          return reply.status(403).send({ code: 5, message: 'user not found', data: null });
        }
        if (user.merchantId && user.merchantId !== merchantId) {
          return reply.status(403).send({ code: 5, message: 'not authorized to access this merchant', data: null });
        }
      }

      // 校验 fileType 合法性
      const validFileTypes: QztFileType[] = ['JY', 'JS', 'JZ', 'ACC', 'SEP', 'DW', 'D0', 'JY_FQ', 'BUSINESS_ORDER'];
      if (!validFileTypes.includes(fileType)) {
        return reply.status(400).send({ code: 2, message: 'invalid fileType', data: null });
      }

      try {
        const result = await bffService.processFile(content, filename, merchantId, fileType);
        if (!result.success) {
          return reply.status(500).send({ code: 3, message: result.error || 'Processing failed', data: null });
        }
        return { code: 0, message: 'success', data: { file_id: result.fileId, records: result.records } };
      } catch (err: any) {
        return reply.status(500).send({ code: 3, message: err.message, data: null });
      }
    });

    // BFF 健康检查
    fastify.get('/bff/health', async () => {
      return { code: 0, message: 'success', data: { status: 'ok', layer: 'bff' } };
    });
  };
}
