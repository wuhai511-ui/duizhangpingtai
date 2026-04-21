/**
 * 对账批次管理 API
 * GET  /reconciliation/batches        — 批次列表
 * POST /reconciliation/batches        — 创建批次
 * GET  /reconciliation/batches/:id    — 批次详情
 * POST /reconciliation/batches/:id/execute — 执行对账
 * GET  /reconciliation/batches/:id/details — 对账明细
 * GET  /reconciliation/batches/:id/report  — 导出报告
 */
import type { FastifyPluginAsync } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { ReconciliationEngine, ResultType } from '../../services/reconciliation-engine.js';

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

let prisma: PrismaClient;
const engine = new ReconciliationEngine();

export const createReconciliationRoutes = (prismaClient: PrismaClient): FastifyPluginAsync => {
  prisma = prismaClient;
  return reconciliationRoutes;
};

export const reconciliationRoutes: FastifyPluginAsync = async (fastify) => {
  /** 批次列表 */
  fastify.get('/reconciliation/batches', async (request) => {
    const query = request.query as Record<string, unknown>;
    const page = Math.max(1, Number(query.page || 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize || 20)));
    const status = query.status as string | undefined;
    const batchType = query.batchType as string | undefined;

    const where: any = {};
    if (status !== undefined) where.status = Number(status);
    if (batchType) where.batch_type = batchType;

    const [total, items] = await Promise.all([
      prisma.reconciliationBatch.count({ where }),
      prisma.reconciliationBatch.findMany({
        where,
        orderBy: { started_at: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return ok({
      list: items.map(item => ({
        ...item,
        total_amount: item.total_amount.toString(),
      })),
      pagination: { page, pageSize, total },
    });
  });

  /** 创建批次 */
  fastify.post('/reconciliation/batches', async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const batchType = body.batch_type as 'ORDER_VS_JY' | 'JY_VS_JS';
    const businessFileId = body.business_file_id as string | undefined;
    const channelFileId = body.channel_file_id as string | undefined;
    const checkDate = body.check_date as string;

    if (!batchType || !['ORDER_VS_JY', 'JY_VS_JS'].includes(batchType)) {
      return reply.status(400).send(err(1, 'Invalid batch_type'));
    }

    const batchNo = `BATCH_${Date.now()}`;

    const batch = await prisma.reconciliationBatch.create({
      data: {
        batch_no: batchNo,
        check_date: checkDate || new Date().toISOString().split('T')[0],
        batch_type: batchType,
        business_file_id: businessFileId,
        channel_file_id: channelFileId,
        record_count: 0,
        total_amount: 0n,
        status: 0,
      },
    });

    return ok({ ...batch, total_amount: batch.total_amount.toString() });
  });

  /** 批次详情 */
  fastify.get('/reconciliation/batches/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const batch = await prisma.reconciliationBatch.findUnique({
      where: { id },
    });

    if (!batch) {
      return reply.status(404).send(err(4, 'Batch not found'));
    }

    return ok({ ...batch, total_amount: batch.total_amount.toString() });
  });

  /** 执行对账 */
  fastify.post('/reconciliation/batches/:id/execute', async (request, reply) => {
    const { id } = request.params as { id: string };

    const batch = await prisma.reconciliationBatch.findUnique({
      where: { id },
    });

    if (!batch) {
      return reply.status(404).send(err(4, 'Batch not found'));
    }

    if (batch.status === 1) {
      return reply.status(400).send(err(2, 'Batch is already running'));
    }

    // 更新状态为处理中
    await prisma.reconciliationBatch.update({
      where: { id },
      data: { status: 1 },
    });

    try {
      let businessData: any[] = [];
      let channelData: any[] = [];

      if (batch.batch_type === 'ORDER_VS_JY') {
        // 业务订单 vs 渠道交易
        const businessWhere: any = {};
        if (batch.check_date) businessWhere.trans_date = batch.check_date;
        if (batch.business_file_id) businessWhere.file_id = batch.business_file_id;

        businessData = await prisma.businessOrder.findMany({
          where: Object.keys(businessWhere).length > 0 ? businessWhere : undefined,
        });

        const channelWhere: any = {};
        if (batch.check_date) channelWhere.trans_date = batch.check_date;
        if (batch.channel_file_id) channelWhere.file_id = batch.channel_file_id;

        channelData = await prisma.jyTransaction.findMany({
          where: Object.keys(channelWhere).length > 0 ? channelWhere : undefined,
        });
      } else if (batch.batch_type === 'JY_VS_JS') {
        // 渠道交易 vs 渠道结算
        const businessWhere: any = {};
        if (batch.check_date) businessWhere.trans_date = batch.check_date;
        if (batch.business_file_id) businessWhere.file_id = batch.business_file_id;

        businessData = await prisma.jyTransaction.findMany({
          where: Object.keys(businessWhere).length > 0 ? businessWhere : undefined,
        });

        const channelWhere: any = {};
        if (batch.check_date) channelWhere.trans_date = batch.check_date;
        if (batch.channel_file_id) channelWhere.file_id = batch.channel_file_id;

        channelData = await prisma.jsSettlement.findMany({
          where: Object.keys(channelWhere).length > 0 ? channelWhere : undefined,
        });
      }

      const result = engine.reconcile(businessData, channelData, batch.batch_type as any);

      // 保存对账明细
      for (const detail of result.details) {
        await prisma.reconciliationDetail.create({
          data: {
            batch_id: id,
            serial_no: detail.serial_no,
            result_type: detail.result_type,
            business_amount: detail.business_amount ? BigInt(detail.business_amount) : null,
            channel_amount: detail.channel_amount ? BigInt(detail.channel_amount) : null,
            diff_amount: detail.diff_amount ? BigInt(detail.diff_amount) : null,
            match_date: detail.match_date || null,
            business_data: detail.business_data || null,
            channel_data: detail.channel_data || null,
          },
        });
      }

      // 更新批次统计
      const totalAmount = result.details.reduce((sum, d) => {
        return sum + (d.business_amount || d.channel_amount || 0n);
      }, 0n);

      await prisma.reconciliationBatch.update({
        where: { id },
        data: {
          record_count: result.stats.total,
          total_amount: totalAmount,
          match_count: result.stats.match,
          rolling_count: result.stats.rolling,
          long_count: result.stats.long,
          short_count: result.stats.short,
          amount_diff_count: result.stats.amount_diff,
          status: 2,
          finished_at: new Date(),
        },
      });

      return ok({
        batch_id: id,
        stats: result.stats,
      });
    } catch (error) {
      await prisma.reconciliationBatch.update({
        where: { id },
        data: {
          status: 3,
          error_msg: (error as Error).message,
        },
      });
      return reply.status(500).send(err(3, (error as Error).message));
    }
  });

  /** 对账明细 */
  fastify.get('/reconciliation/batches/:id/details', async (request) => {
    const { id } = request.params as { id: string };
    const query = request.query as Record<string, unknown>;
    const page = Math.max(1, Number(query.page || 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize || 20)));
    const resultType = query.result_type as string | undefined;

    const where: any = { batch_id: id };
    if (resultType) where.result_type = resultType;

    const [total, items] = await Promise.all([
      prisma.reconciliationDetail.count({ where }),
      prisma.reconciliationDetail.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return ok(items.map(item => ({
      ...item,
      business_amount: item.business_amount?.toString(),
      channel_amount: item.channel_amount?.toString(),
      diff_amount: item.diff_amount?.toString(),
    })), { page, pageSize, total });
  });

  /** 导出报告 */
  fastify.get('/reconciliation/batches/:id/report', async (request, reply) => {
    const { id } = request.params as { id: string };

    const batch = await prisma.reconciliationBatch.findUnique({
      where: { id },
    });

    if (!batch) {
      return reply.status(404).send(err(4, 'Batch not found'));
    }

    const details = await prisma.reconciliationDetail.findMany({
      where: { batch_id: id },
    });

    // 生成 CSV 报告
    const headers = ['流水号', '结果类型', '业务方金额', '渠道方金额', '差异金额', '匹配日期'];
    const rows = details.map(d => [
      d.serial_no,
      d.result_type,
      (d.business_amount || 0).toString(),
      (d.channel_amount || 0).toString(),
      (d.diff_amount || 0).toString(),
      d.match_date || '',
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

    reply.header('Content-Type', 'text/csv; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="reconciliation_${batch.batch_no}.csv"`);
    return reply.send('\uFEFF' + csv); // BOM for Excel
  });
};