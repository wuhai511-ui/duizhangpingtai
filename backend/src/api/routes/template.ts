/**
 * 账单模板 API
 * GET  /templates        — 模板列表
 * POST /templates        — 创建模板
 * PUT  /templates/:id    — 更新模板
 * DELETE /templates/:id  — 删除模板
 * POST /templates/match  — 智能匹配模板
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

interface TemplateField {
  header: string;
  field: string;
  required?: boolean;
  type?: 'string' | 'amount' | 'date';
}

interface FieldConfig {
  fields: TemplateField[];
  dateFormat?: string;
  amountUnit?: 'yuan' | 'fen';
}

let prisma: PrismaClient;

export const createTemplateRoutes = (prismaClient: PrismaClient): FastifyPluginAsync => {
  prisma = prismaClient;
  return templateRoutes;
};

export const templateRoutes: FastifyPluginAsync = async (fastify) => {
  /** 模板列表 */
  fastify.get('/templates', async (request) => {
    const query = request.query as Record<string, unknown>;
    const type = query.type as string | undefined;

    const where: any = {};
    if (type) where.type = type;

    const items = await prisma.billTemplate.findMany({
      where,
      orderBy: [{ is_default: 'desc' }, { created_at: 'desc' }],
    });

    return ok(items.map(item => ({
      ...item,
      field_config: JSON.parse(item.field_config),
    })));
  });

  /** 创建模板 */
  fastify.post('/templates', async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const name = body.name as string;
    const type = body.type as string;
    const fieldConfig = body.field_config as FieldConfig;
    const delimiter = body.delimiter as string || '|';
    const headerRow = body.header_row as number || 1;
    const dataStartRow = body.data_start_row as number || 2;
    const isDefault = body.is_default as boolean || false;

    if (!name || !type || !fieldConfig) {
      return reply.status(400).send(err(1, 'name, type, and field_config are required'));
    }

    const template = await prisma.billTemplate.create({
      data: {
        name,
        type,
        field_config: JSON.stringify(fieldConfig),
        delimiter,
        header_row: headerRow,
        data_start_row: dataStartRow,
        is_default: isDefault,
      },
    });

    return ok({ ...template, field_config: fieldConfig });
  });

  /** 更新模板 */
  fastify.put('/templates/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;

    const updateData: any = {};
    if (body.name) updateData.name = body.name;
    if (body.type) updateData.type = body.type;
    if (body.field_config) updateData.field_config = JSON.stringify(body.field_config);
    if (body.delimiter) updateData.delimiter = body.delimiter;
    if (body.header_row !== undefined) updateData.header_row = body.header_row;
    if (body.data_start_row !== undefined) updateData.data_start_row = body.data_start_row;
    if (body.is_default !== undefined) updateData.is_default = body.is_default;

    const template = await prisma.billTemplate.update({
      where: { id },
      data: updateData,
    });

    return ok({ ...template, field_config: JSON.parse(template.field_config) });
  });

  /** 删除模板 */
  fastify.delete('/templates/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    await prisma.billTemplate.delete({
      where: { id },
    });

    return ok({ success: true });
  });

  /** 智能匹配模板 */
  fastify.post('/templates/match', async (request) => {
    const body = request.body as Record<string, unknown>;
    const headers = body.headers as string[];
    const type = body.type as string | undefined;

    if (!headers || !Array.isArray(headers)) {
      return ok({ matched: false, confidence: 0 });
    }

    // 获取所有模板
    const templates = await prisma.billTemplate.findMany({
      where: type ? { type } : {},
    });

    let bestMatch: any = null;
    let bestScore = 0;

    for (const template of templates) {
      const config = JSON.parse(template.field_config) as FieldConfig;
      const templateHeaders = config.fields.map(f => f.header.toLowerCase());

      // 计算匹配分数
      let matchCount = 0;
      for (const header of headers) {
        if (templateHeaders.includes(header.toLowerCase())) {
          matchCount++;
        }
      }

      const score = matchCount / templateHeaders.length;

      if (score > bestScore) {
        bestScore = score;
        bestMatch = template;
      }
    }

    if (bestMatch && bestScore >= 0.5) {
      return ok({
        matched: true,
        template: {
          ...bestMatch,
          field_config: JSON.parse(bestMatch.field_config),
        },
        confidence: bestScore,
      });
    }

    return ok({ matched: false, confidence: bestScore });
  });
};