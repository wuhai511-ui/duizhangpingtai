/**
 * 商户 API
 * GET  /merchants           — 商户列表
 * POST /merchants           — 创建商户
 * GET  /merchants/:id       — 商户详情
 * PUT  /merchants/:id       — 更新商户
 * DELETE /merchants/:id     — 删除商户
 * GET  /merchants/:id/stats — 商户统计数据
 */
import type { FastifyPluginAsync } from 'fastify';

interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data: T;
  pagination?: { page: number; pageSize: number; total: number };
}

function ok<T>(data: T, pagination?: ApiResponse<T>['pagination']): ApiResponse<T> {
  return { code: 0, message: 'success', data, pagination };
}

function err(code: number, message: string) {
  return { code, message, data: null as unknown };
}

interface Merchant {
  id: string;
  merchant_no: string;
  name?: string;
  status: number;
  created_at: string;
  updated_at?: string;
}

interface MerchantStats {
  merchantId: string;
  todayTransactions: number;
  todayAmount: number;
  pendingReconciliation: number;
}

/** 内存中的商户数据（mock） */
const merchants = new Map<string, Merchant>();

export const merchantRoutes: FastifyPluginAsync = async (fastify) => {
  /** 商户列表 */
  fastify.get('/merchants', async (request) => {
    const query = request.query as Record<string, unknown>;
    const page = Math.max(1, Number(query.page || 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize || 20)));
    const status = query.status !== undefined ? Number(query.status) : undefined;

    let list = Array.from(merchants.values());
    if (status !== undefined) list = list.filter((m) => m.status === status);

    list.sort((a, b) => b.created_at.localeCompare(a.created_at));

    const total = list.length;
    const start = (page - 1) * pageSize;
    const items = list.slice(start, start + pageSize);

    return { code: 0, message: 'success', data: { list: items, pagination: { page, pageSize, total } } };
  });

  /** 创建商户 */
  fastify.post('/merchants', async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const merchantNo = body.merchant_no as string;
    const name = body.name as string | undefined;

    if (!merchantNo || typeof merchantNo !== 'string') {
      return reply.status(400).send(err(1, 'merchant_no is required'));
    }

    // 检查重复
    const existing = Array.from(merchants.values()).find((m) => m.merchant_no === merchantNo);
    if (existing) {
      return reply.status(409).send(err(2, 'Merchant already exists'));
    }

    const id = `mch_${Date.now()}`;
    const merchant: Merchant = {
      id,
      merchant_no: merchantNo,
      name: name || merchantNo,
      status: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    merchants.set(id, merchant);

    return ok(merchant);
  });

  /** 商户详情 */
  fastify.get('/merchants/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const merchant = merchants.get(id);

    if (!merchant) {
      return reply.status(404).send(err(4, 'Merchant not found'));
    }

    return ok(merchant);
  });

  /** 更新商户 */
  fastify.put('/merchants/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;
    const merchant = merchants.get(id);

    if (!merchant) {
      return reply.status(404).send(err(4, 'Merchant not found'));
    }

    // 只允许更新 name 和 status
    if (body.name !== undefined) merchant.name = String(body.name);
    if (body.status !== undefined) merchant.status = Number(body.status);
    merchant.updated_at = new Date().toISOString();

    merchants.set(id, merchant);
    return ok(merchant);
  });

  /** 删除商户 */
  fastify.delete('/merchants/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    if (!merchants.has(id)) {
      return reply.status(404).send(err(4, 'Merchant not found'));
    }

    merchants.delete(id);
    return ok({ id });
  });

  /** 商户统计数据 */
  fastify.get('/merchants/:id/stats', async (request, reply) => {
    const { id } = request.params as { id: string };
    const merchant = merchants.get(id);

    if (!merchant) {
      return reply.status(404).send(err(4, 'Merchant not found'));
    }

    const stats: MerchantStats = {
      merchantId: id,
      todayTransactions: 0,
      todayAmount: 0,
      pendingReconciliation: 0,
    };

    return ok(stats);
  });
};
