import type { FastifyPluginAsync } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import {
  DEFAULT_RECON_TEMPLATES,
  getDefaultTemplateByBatchType,
  type BatchType,
  type ReconTemplate,
} from '../../config/reconciliation-templates.js';

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

const RECON_TEMPLATE_TYPE = 'RECON_TEMPLATE';

interface TemplateView {
  id: string;
  template: ReconTemplate;
  is_default: boolean;
  source: 'builtin' | 'custom';
  readonly: boolean;
  created_at?: string;
  updated_at?: string;
}

function isBatchType(value: unknown): value is BatchType {
  return value === 'ORDER_VS_JY' || value === 'JY_VS_JS';
}

function validateTemplate(template: any): string | null {
  if (!template || typeof template !== 'object') return 'template is required';
  if (!isBatchType(template.batch_type)) return 'invalid batch_type';
  if (!Array.isArray(template.primary_keys) || template.primary_keys.length === 0) {
    return 'primary_keys is required';
  }
  if (!template.amount_check || !template.date_check) {
    return 'amount_check and date_check are required';
  }
  return null;
}

function normalizeTemplate(template: any, fallbackId?: string): ReconTemplate {
  return {
    id: String(template.id || fallbackId || `custom_${Date.now()}`),
    name: String(template.name || '自定义模板'),
    batch_type: template.batch_type as BatchType,
    description: template.description ? String(template.description) : undefined,
    business_source: template.business_source,
    channel_source: template.channel_source,
    primary_keys: Array.isArray(template.primary_keys) ? template.primary_keys : [],
    auxiliary_fields: Array.isArray(template.auxiliary_fields) ? template.auxiliary_fields : [],
    amount_check: template.amount_check,
    date_check: template.date_check,
    additional_rules: Array.isArray(template.additional_rules) ? template.additional_rules : undefined,
  };
}

function buildBuiltinTemplates(batchType?: BatchType): TemplateView[] {
  const builtin = Object.values(DEFAULT_RECON_TEMPLATES)
    .filter((item) => !batchType || item.batch_type === batchType)
    .map<TemplateView>((item) => ({
      id: item.id,
      template: item,
      is_default: getDefaultTemplateByBatchType(item.batch_type)?.id === item.id,
      source: 'builtin',
      readonly: true,
    }));
  return builtin;
}

export const createReconciliationTemplateConfigRoutes = (prisma: PrismaClient): FastifyPluginAsync => {
  return async (fastify) => {
    fastify.get('/reconciliation/template-configs', async (request, reply) => {
      const query = request.query as { batch_type?: BatchType };
      const batchType = query.batch_type;
      if (batchType && !isBatchType(batchType)) {
        return reply.status(400).send(err(400, 'invalid batch_type'));
      }

      const rows = await prisma.billTemplate.findMany({
        where: { type: RECON_TEMPLATE_TYPE },
        orderBy: [{ is_default: 'desc' }, { updated_at: 'desc' }],
      });

      const customTemplates = rows
        .map((row) => {
          try {
            const raw = JSON.parse(row.field_config || '{}');
            const template = normalizeTemplate(raw, row.id);
            return {
              id: row.id,
              template,
              is_default: row.is_default,
              source: 'custom' as const,
              readonly: false,
              created_at: row.created_at.toISOString(),
              updated_at: row.updated_at.toISOString(),
            };
          } catch {
            return null;
          }
        })
        .filter((item): item is NonNullable<typeof item> => !!item)
        .filter((item) => !batchType || item.template.batch_type === batchType);

      return ok([...customTemplates, ...buildBuiltinTemplates(batchType)]);
    });

    fastify.post('/reconciliation/template-configs', async (request, reply) => {
      const body = request.body as {
        template?: ReconTemplate;
        is_default?: boolean;
      };
      const invalid = validateTemplate(body?.template);
      if (invalid) {
        return reply.status(400).send(err(400, invalid));
      }

      const template = normalizeTemplate(body.template);

      if (body.is_default) {
        const existing = await prisma.billTemplate.findMany({
          where: { type: RECON_TEMPLATE_TYPE, is_default: true },
        });
        for (const row of existing) {
          try {
            const parsed = JSON.parse(row.field_config || '{}');
            if (parsed?.batch_type === template.batch_type) {
              await prisma.billTemplate.update({
                where: { id: row.id },
                data: { is_default: false },
              });
            }
          } catch {
            continue;
          }
        }
      }

      const created = await prisma.billTemplate.create({
        data: {
          name: template.name,
          type: RECON_TEMPLATE_TYPE,
          field_config: JSON.stringify(template),
          match_rules: JSON.stringify({ batch_type: template.batch_type }),
          delimiter: '|',
          header_row: 1,
          data_start_row: 2,
          is_default: Boolean(body.is_default),
        },
      });

      return ok({
        id: created.id,
        template: { ...template, id: created.id },
        is_default: created.is_default,
        source: 'custom',
        readonly: false,
      });
    });

    fastify.put('/reconciliation/template-configs/:id', async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as {
        template?: ReconTemplate;
        is_default?: boolean;
      };
      const invalid = validateTemplate(body?.template);
      if (invalid) {
        return reply.status(400).send(err(400, invalid));
      }

      const current = await prisma.billTemplate.findUnique({ where: { id } });
      if (!current || current.type !== RECON_TEMPLATE_TYPE) {
        return reply.status(404).send(err(404, 'template not found'));
      }

      const template = normalizeTemplate(body.template, id);

      if (body.is_default) {
        const existing = await prisma.billTemplate.findMany({
          where: { type: RECON_TEMPLATE_TYPE, is_default: true },
        });
        for (const row of existing) {
          if (row.id === id) continue;
          try {
            const parsed = JSON.parse(row.field_config || '{}');
            if (parsed?.batch_type === template.batch_type) {
              await prisma.billTemplate.update({
                where: { id: row.id },
                data: { is_default: false },
              });
            }
          } catch {
            continue;
          }
        }
      }

      const updated = await prisma.billTemplate.update({
        where: { id },
        data: {
          name: template.name,
          field_config: JSON.stringify(template),
          match_rules: JSON.stringify({ batch_type: template.batch_type }),
          is_default: body.is_default !== undefined ? Boolean(body.is_default) : undefined,
        },
      });

      return ok({
        id: updated.id,
        template: { ...template, id: updated.id },
        is_default: updated.is_default,
        source: 'custom',
        readonly: false,
      });
    });

    fastify.delete('/reconciliation/template-configs/:id', async (request, reply) => {
      const { id } = request.params as { id: string };
      const current = await prisma.billTemplate.findUnique({ where: { id } });
      if (!current || current.type !== RECON_TEMPLATE_TYPE) {
        return reply.status(404).send(err(404, 'template not found'));
      }

      await prisma.billTemplate.delete({ where: { id } });
      return ok({ id });
    });
  };
};
