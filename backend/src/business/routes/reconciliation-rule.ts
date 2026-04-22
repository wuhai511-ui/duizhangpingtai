import type { FastifyPluginAsync } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { RuleService } from '../services/rule.service.js';

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

export const createReconciliationRuleRoutes = (prisma: PrismaClient): FastifyPluginAsync => {
  const ruleService = new RuleService(prisma);

  return async (fastify) => {
    fastify.get('/reconciliation/rules', async () => {
      const rules = await ruleService.listAll();
      return ok(rules);
    });

    fastify.post('/reconciliation/rules', async (request, reply) => {
      const body = request.body as {
        name?: string;
        description?: string;
        rule_type?: string;
        condition?: Record<string, unknown>;
        action?: Record<string, unknown>;
        priority?: number;
        enabled?: boolean;
      };

      if (!body.name || !body.rule_type || !body.condition || !body.action) {
        return reply.status(400).send(err(400, 'name, rule_type, condition and action are required'));
      }

      const created = await ruleService.create({
        name: body.name,
        description: body.description,
        rule_type: body.rule_type,
        condition: body.condition,
        action: body.action,
        priority: body.priority,
        enabled: body.enabled,
      });

      return ok(created);
    });

    fastify.patch('/reconciliation/rules/:id', async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as {
        name?: string;
        description?: string | null;
        condition?: Record<string, unknown>;
        action?: Record<string, unknown>;
        priority?: number;
        enabled?: boolean;
      };

      try {
        const updated = await ruleService.update(id, body);
        return ok(updated);
      } catch (error) {
        return reply.status(404).send(err(404, (error as Error).message));
      }
    });

    fastify.delete('/reconciliation/rules/:id', async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        await ruleService.remove(id);
        return ok({ id });
      } catch (error) {
        return reply.status(404).send(err(404, (error as Error).message));
      }
    });

    fastify.post('/reconciliation/rules/:id/toggle', async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const updated = await ruleService.toggle(id);
        return ok(updated);
      } catch (error) {
        return reply.status(404).send(err(404, (error as Error).message));
      }
    });
  };
};
