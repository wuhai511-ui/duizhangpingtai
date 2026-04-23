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
import { ReconciliationEngine } from '../services/reconciliation-engine.js';
import { ReconPostProcessor } from '../services/recon-post-processor.js';
import {
  getDefaultTemplateByBatchType,
  getReconTemplate,
  type BatchType,
  type ReconTemplate,
} from '../../config/reconciliation-templates.js';

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
let postProcessor: ReconPostProcessor;
const RECON_TEMPLATE_TYPE = 'RECON_TEMPLATE';

async function getCustomTemplateById(templateId: string): Promise<ReconTemplate | null> {
  const row = await prisma.billTemplate.findUnique({ where: { id: templateId } });
  if (!row || row.type !== RECON_TEMPLATE_TYPE) return null;
  try {
    const parsed = JSON.parse(row.field_config || '{}');
    return { ...parsed, id: row.id } as ReconTemplate;
  } catch {
    return null;
  }
}

async function getDefaultCustomTemplate(batchType: BatchType): Promise<ReconTemplate | null> {
  const rows = await prisma.billTemplate.findMany({
    where: { type: RECON_TEMPLATE_TYPE, is_default: true },
    orderBy: { updated_at: 'desc' },
  });
  for (const row of rows) {
    try {
      const parsed = JSON.parse(row.field_config || '{}');
      if (parsed?.batch_type === batchType) {
        return { ...parsed, id: row.id } as ReconTemplate;
      }
    } catch {
      continue;
    }
  }
  return null;
}

async function resolveReconTemplate(
  batchType: BatchType,
  templateId?: string,
): Promise<ReconTemplate | null> {
  if (templateId) {
    const custom = await getCustomTemplateById(templateId);
    if (custom) return custom;
    return getReconTemplate(templateId);
  }
  const customDefault = await getDefaultCustomTemplate(batchType);
  if (customDefault) return customDefault;
  return getDefaultTemplateByBatchType(batchType);
}

function buildBatchWhere(fileId?: string | null, checkDate?: string | null) {
  if (fileId) {
    return { file_id: fileId };
  }
  if (checkDate) {
    return { trans_date: checkDate };
  }
  return null;
}

async function loadBatchData(batch: {
  batch_type: string;
  business_file_id?: string | null;
  channel_file_id?: string | null;
  check_date?: string | null;
}) {
  const businessWhere = buildBatchWhere(batch.business_file_id, batch.check_date);
  const channelWhere = buildBatchWhere(batch.channel_file_id, batch.check_date);

  if (!businessWhere || !channelWhere) {
    throw new Error('Batch is missing source selectors for rerun');
  }

  if (batch.batch_type === 'ORDER_VS_JY') {
    const [businessData, channelData] = await Promise.all([
      prisma.businessOrder.findMany({ where: businessWhere }),
      prisma.jyTransaction.findMany({ where: channelWhere }),
    ]);
    return { businessData, channelData };
  }

  if (batch.batch_type === 'JY_VS_JS') {
    const [businessData, channelData] = await Promise.all([
      prisma.jyTransaction.findMany({ where: businessWhere }),
      prisma.jsSettlement.findMany({ where: channelWhere }),
    ]);
    return { businessData, channelData };
  }

  throw new Error(`Unsupported batch type: ${batch.batch_type}`);
}

export const createReconciliationRoutes = (prismaClient: PrismaClient): FastifyPluginAsync => {
  prisma = prismaClient;
  postProcessor = new ReconPostProcessor(prismaClient);
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
      list: items.map((item: any) => ({
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
    const body = (request.body as { template_id?: string } | undefined) || {};

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
      data: { status: 1, post_process_status: 'PENDING', post_processed_at: null },
    });

    try {
      const { businessData, channelData } = await loadBatchData(batch);

      const template = await resolveReconTemplate(batch.batch_type as BatchType, body.template_id);
      const result = engine.reconcile(
        businessData,
        channelData,
        batch.batch_type as any,
        template ? { template } : {},
      );

      // 保存对账明细
      for (const detail of result.details) {
        await prisma.reconciliationDetail.create({
          data: {
            batch_id: id,
            serial_no: detail.serial_no,
            result_type: detail.result_type,
            final_result_type: detail.result_type,
            process_status: 'PENDING',
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

      let postProcessResult: unknown = null;
      let postProcessError: string | null = null;
      try {
        postProcessResult = await postProcessor.processBatch(id);
      } catch (postError) {
        postProcessError = (postError as Error).message;
      }

      return ok({
        batch_id: id,
        stats: result.stats,
        post_process: postProcessError
          ? { status: 'FAILED', message: postProcessError }
          : { status: 'DONE', result: postProcessResult },
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

    return ok(items.map((item: any) => ({
      ...item,
      business_amount: item.business_amount?.toString(),
      channel_amount: item.channel_amount?.toString(),
      diff_amount: item.diff_amount?.toString(),
    })), { page, pageSize, total });
  });

  /** 对账批次重新执行 */
  fastify.post('/reconciliation/batches/:id/rerun', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { template_id?: string };

    // 获取批次
    const batch = await prisma.reconciliationBatch.findUnique({
      where: { id },
      include: { details: true },
    });

    if (!batch) {
      return reply.status(404).send(err(4, 'Batch not found'));
    }

    // 更新状态为处理中
    await prisma.reconciliationBatch.update({
      where: { id },
      data: { status: 1, started_at: new Date(), post_process_status: 'PENDING', post_processed_at: null },
    });

    try {
      const { businessData, channelData } = await loadBatchData(batch);
      const template = await resolveReconTemplate(batch.batch_type as BatchType, body.template_id);
      const result = engine.reconcile(
        businessData,
        channelData,
        batch.batch_type as any,
        template ? { template } : {},
      );

      // 清除旧明细
      await prisma.reconProcessLog.deleteMany({ where: { batch_id: id } });
      await prisma.exceptionTicket.deleteMany({ where: { batch_id: id } });
      await prisma.reconciliationDetail.deleteMany({ where: { batch_id: id } });

      // 保存新对账明细
      for (const detail of result.details) {
        await prisma.reconciliationDetail.create({
          data: {
            batch_id: id,
            serial_no: detail.serial_no,
            result_type: detail.result_type,
            final_result_type: detail.result_type,
            process_status: 'PENDING',
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

      let postProcessResult: unknown = null;
      let postProcessError: string | null = null;
      try {
        postProcessResult = await postProcessor.processBatch(id, { force: true });
      } catch (postError) {
        postProcessError = (postError as Error).message;
      }

      return ok({
        batch_id: id,
        stats: result.stats,
        post_process: postProcessError
          ? { status: 'FAILED', message: postProcessError }
          : { status: 'DONE', result: postProcessResult },
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
    const rows = details.map((d: any) => [
      d.serial_no,
      d.result_type,
      (d.business_amount || 0).toString(),
      (d.channel_amount || 0).toString(),
      (d.diff_amount || 0).toString(),
      d.match_date || '',
    ]);

    const csv = [headers.join(','), ...rows.map((r: string[]) => r.join(','))].join('\n');

    reply.header('Content-Type', 'text/csv; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="reconciliation_${batch.batch_no}.csv"`);
    return reply.send('\uFEFF' + csv); // BOM for Excel
  });

  /**
   * GET /reconciliation/templates — 获取对账模板列表
   */
  fastify.get('/reconciliation/templates', async () => {
    const { getAllReconTemplates } = await import('../../config/reconciliation-templates.js');
    const templates = getAllReconTemplates();
    return ok(templates);
  });

  /**
   * GET /reconciliation/templates/:id — 获取对账模板详情
   */
  fastify.get('/reconciliation/templates/:id', async (request) => {
    const { id } = request.params as { id: string };
    const { getReconTemplate } = await import('../../config/reconciliation-templates.js');
    const template = getReconTemplate(id);
    if (!template) {
      return err(1, 'Template not found');
    }
    return ok(template);
  });
};
