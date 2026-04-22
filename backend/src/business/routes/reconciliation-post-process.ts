import type { FastifyPluginAsync } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { ReconPostProcessor } from '../services/recon-post-processor.js';

interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data: T;
}

function ok<T>(data: T): ApiResponse<T> {
  return { code: 0, message: 'success', data };
}

function err(code: number, message: string): ApiResponse<null> {
  return { code, message, data: null };
}

export const createReconciliationPostProcessRoutes = (prisma: PrismaClient): FastifyPluginAsync => {
  const postProcessor = new ReconPostProcessor(prisma);

  return async (fastify) => {
    fastify.post('/reconciliation/batches/:batchId/post-process', async (request, reply) => {
      const { batchId } = request.params as { batchId: string };
      const body = request.body as { force?: boolean } | undefined;

      try {
        const result = await postProcessor.processBatch(batchId, { force: body?.force ?? false });
        return ok(result);
      } catch (error) {
        return reply.status(400).send(err(400, (error as Error).message));
      }
    });

    fastify.get('/reconciliation/batches/:batchId/post-process/status', async (request, reply) => {
      const { batchId } = request.params as { batchId: string };

      const batch = await prisma.reconciliationBatch.findUnique({ where: { id: batchId } });
      if (!batch) {
        return reply.status(404).send(err(404, 'Batch not found'));
      }

      const [processedDetails, ticketCount] = await Promise.all([
        prisma.reconciliationDetail.count({
          where: {
            batch_id: batchId,
            process_status: { not: 'PENDING' },
          },
        }),
        prisma.exceptionTicket.count({ where: { batch_id: batchId } }),
      ]);

      return ok({
        batch_id: batchId,
        post_process_status: batch.post_process_status,
        post_processed_at: batch.post_processed_at,
        processed_details: processedDetails,
        ticket_count: ticketCount,
      });
    });
  };
};
