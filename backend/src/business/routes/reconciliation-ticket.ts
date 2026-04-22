import type { FastifyPluginAsync } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { TicketService } from '../services/ticket.service.js';

type TicketStatus = 'OPEN' | 'PROCESSING' | 'RESOLVED' | 'CLOSED';
type TicketSeverity = 'LOW' | 'MEDIUM' | 'HIGH';

interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data: T;
  pagination?: { page: number; pageSize: number; total: number };
}

function ok<T>(data: T, pagination?: ApiResponse<T>['pagination']): ApiResponse<T> {
  return { code: 0, message: 'success', data, pagination };
}

function err(code: number, message: string): ApiResponse<null> {
  return { code, message, data: null };
}

export const createReconciliationTicketRoutes = (prisma: PrismaClient): FastifyPluginAsync => {
  const ticketService = new TicketService(prisma);

  return async (fastify) => {
    fastify.get('/reconciliation/tickets', async (request) => {
      const query = request.query as Record<string, string | undefined>;
      const page = Math.max(1, Number(query.page || 1));
      const pageSize = Math.min(100, Math.max(1, Number(query.page_size || 20)));

      const result = await ticketService.list({
        batch_id: query.batch_id,
        status: query.status as TicketStatus | undefined,
        exception_type: query.exception_type,
        severity: query.severity as TicketSeverity | undefined,
        assignee_id: query.assignee_id,
        page,
        page_size: pageSize,
      });

      return ok(result.list, { page, pageSize, total: result.total });
    });

    fastify.get('/reconciliation/tickets/:id', async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const detail = await ticketService.detail(id);
        return ok(detail);
      } catch (error) {
        const message = (error as Error).message;
        if (message === 'Ticket not found') {
          return reply.status(404).send(err(404, message));
        }
        return reply.status(500).send(err(500, message));
      }
    });

    fastify.patch('/reconciliation/tickets/:id', async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as {
        status?: TicketStatus;
        assignee_id?: string | null;
        resolution_note?: string | null;
        severity?: TicketSeverity;
      };

      try {
        const updated = await ticketService.patch(id, body, request.headers['x-user-id'] as string | undefined);
        return ok(updated);
      } catch (error) {
        const message = (error as Error).message;
        const statusCode = message.includes('not found') ? 404 : 400;
        return reply.status(statusCode).send(err(statusCode, message));
      }
    });

    fastify.post('/reconciliation/tickets/:id/resolve', async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as {
        resolution: 'MANUAL_CONFIRM' | 'MANUAL_ADJUST' | 'DUPLICATE_REMOVED' | 'IGNORED' | 'AUTO_ADJUST' | 'AUTO_CONVERT';
        resolution_note?: string;
        final_status?: 'RESOLVED' | 'CLOSED';
      };

      if (!body.resolution) {
        return reply.status(400).send(err(400, 'resolution is required'));
      }

      try {
        const updated = await ticketService.resolve(id, body, request.headers['x-user-id'] as string | undefined);
        return ok(updated);
      } catch (error) {
        const message = (error as Error).message;
        const statusCode = message.includes('not found') ? 404 : 400;
        return reply.status(statusCode).send(err(statusCode, message));
      }
    });

    fastify.post('/reconciliation/tickets/:id/reopen', async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const updated = await ticketService.reopen(id, request.headers['x-user-id'] as string | undefined);
        return ok(updated);
      } catch (error) {
        const message = (error as Error).message;
        const statusCode = message.includes('not found') ? 404 : 400;
        return reply.status(statusCode).send(err(statusCode, message));
      }
    });
  };
};
