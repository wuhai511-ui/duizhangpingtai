/**
 * 交易流水 API
 * GET  /transactions          — 交易列表
 * GET  /transactions/:id     — 交易详情
 * GET  /transactions/export   — 导出交易
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

interface JyTransaction {
  id: string;
  serial_no: string;
  merchant_id: string;
  trans_date: string;
  trans_time: string;
  amount: number;
  trans_type: string;
  status: string;
  channel_name?: string;
  created_at: string;
}

/** 内存中的交易数据（mock） */
const transactions = new Map<string, JyTransaction>();

export const transactionRoutes: FastifyPluginAsync = async (fastify) => {
  /** 交易列表 */
  fastify.get('/transactions', async (request) => {
    const query = request.query as Record<string, unknown>;
    const page = Math.max(1, Number(query.page || 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize || 20)));
    const merchantId = query.merchantId as string | undefined;
    const transType = query.transType as string | undefined;
    const startDate = query.startDate as string | undefined;
    const endDate = query.endDate as string | undefined;

    let list = Array.from(transactions.values());

    if (merchantId) list = list.filter((t) => t.merchant_id === merchantId);
    if (transType) list = list.filter((t) => t.trans_type === transType);
    if (startDate) list = list.filter((t) => t.trans_date >= startDate);
    if (endDate) list = list.filter((t) => t.trans_date <= endDate);

    list.sort((a, b) => b.created_at.localeCompare(a.created_at));

    const total = list.length;
    const start = (page - 1) * pageSize;
    const items = list.slice(start, start + pageSize);

    return ok({ list: items, pagination: { page, pageSize, total } });
  });

  /** 交易详情 */
  fastify.get('/transactions/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const transaction = transactions.get(id);

    if (!transaction) {
      return reply.status(404).send(err(4, 'Transaction not found'));
    }

    return ok(transaction);
  });

  /** 导出交易 */
  fastify.get('/transactions/export', async (request) => {
    const query = request.query as Record<string, unknown>;
    const merchantId = query.merchantId as string | undefined;
    const startDate = query.startDate as string | undefined;
    const endDate = query.endDate as string | undefined;

    let list = Array.from(transactions.values());

    if (merchantId) list = list.filter((t) => t.merchant_id === merchantId);
    if (startDate) list = list.filter((t) => t.trans_date >= startDate);
    if (endDate) list = list.filter((t) => t.trans_date <= endDate);

    // CSV 格式
    const headers = ['流水号', '商户号', '交易日期', '交易时间', '金额(分)', '类型', '状态', '渠道'];
    const rows = list.map((t) => [
      t.serial_no,
      t.merchant_id,
      t.trans_date,
      t.trans_time,
      t.amount.toString(),
      t.trans_type,
      t.status,
      t.channel_name || '',
    ]);

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

    return { code: 0, message: 'success', data: csv };
  });
};
