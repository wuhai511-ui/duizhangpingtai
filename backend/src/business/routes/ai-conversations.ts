import type { FastifyPluginAsync } from 'fastify';
import type { PrismaClient } from '@prisma/client';

interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data: T;
}

type MessageType = 'text' | 'sql_result' | 'file_notice' | 'reconcile_result';
type MessageRole = 'user' | 'assistant';

function ok<T>(data: T): ApiResponse<T> {
  return { code: 0, message: 'success', data };
}

function err(code: number, message: string): ApiResponse<null> {
  return { code, message, data: null };
}

function getUserId(request: any): string {
  return request.user?.id || 'anonymous';
}

function toIso(value: Date | string | null | undefined): string {
  if (!value) return new Date().toISOString();
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function parseMetaJson(value: string | null | undefined): Record<string, unknown> | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function mapConversation(row: any) {
  return {
    id: row.id,
    title: row.title,
    merchant_id: row.merchant_id,
    created_by: row.created_by,
    latest_message_preview: row.latest_message_preview,
    latest_message_type: row.latest_message_type,
    last_message_at: toIso(row.last_message_at),
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
  };
}

function mapMessage(row: any) {
  return {
    id: row.id,
    conversation_id: row.conversation_id,
    role: row.role,
    message_type: row.message_type,
    content: row.content,
    sql_text: row.sql_text,
    meta_json: parseMetaJson(row.meta_json),
    created_at: toIso(row.created_at),
  };
}

function normalizeFiles(body: Record<string, unknown>): Array<Record<string, unknown>> {
  if (Array.isArray(body.files)) {
    return body.files.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object');
  }

  if (body.file_id || body.file_name || body.file_type) {
    return [body];
  }

  return [];
}

function resolveNoticeContent(files: Array<Record<string, unknown>>): string {
  if (files.length === 1) {
    const file = files[0];
    return `已记录上传文件：${String(file.filename || file.file_name || '未知文件')}`;
  }
  return `已记录上传文件，共 ${files.length} 个`;
}

function buildMessage(params: {
  conversationId: string;
  role: MessageRole;
  messageType: MessageType;
  content: string;
  sqlText?: string | null;
  metaJson?: Record<string, unknown> | null;
}) {
  return {
    id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    conversation_id: params.conversationId,
    role: params.role,
    message_type: params.messageType,
    content: params.content,
    sql_text: params.sqlText ?? null,
    meta_json: params.metaJson ? JSON.stringify(params.metaJson) : null,
  };
}

async function appendMessages(prisma: PrismaClient, ...items: ReturnType<typeof buildMessage>[]) {
  if (items.length === 0) return;

  await prisma.aiConversationMessage.createMany({ data: items });

  const last = items[items.length - 1];
  await prisma.aiConversation.update({
    where: { id: last.conversation_id },
    data: {
      latest_message_preview:
        last.content.length > 120 ? `${last.content.slice(0, 120)}...` : last.content,
      latest_message_type: last.message_type,
      last_message_at: new Date(),
    },
  });
}

async function getConversation(prisma: PrismaClient, id: string) {
  return prisma.aiConversation.findUnique({ where: { id } });
}

async function ensureConversation(
  prisma: PrismaClient,
  id: string,
  userId: string,
  body?: Record<string, unknown>,
) {
  const existing = await getConversation(prisma, id);
  if (existing) return existing;

  const now = new Date();
  return prisma.aiConversation.create({
    data: {
      id,
      title: String(body?.title || '默认会话'),
      merchant_id: body?.merchant_id ? String(body.merchant_id) : null,
      created_by: userId,
      latest_message_preview: null,
      latest_message_type: null,
      last_message_at: now,
      created_at: now,
      updated_at: now,
    },
  });
}

export const createAiConversationRoutes = (prisma: PrismaClient): FastifyPluginAsync => {
  return async (fastify) => {
    fastify.get('/ai/conversations', async (request) => {
      const userId = getUserId(request);
      const list = await prisma.aiConversation.findMany({
        where: { created_by: userId },
        orderBy: { last_message_at: 'desc' },
      });

      return ok(list.map(mapConversation));
    });

    fastify.post('/ai/conversations', async (request) => {
      const body = (request.body as Record<string, unknown> | undefined) || {};
      const userId = getUserId(request);
      const now = new Date();
      const conversation = await prisma.aiConversation.create({
        data: {
          id: `conv_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
          title: String(body.title || '新会话'),
          merchant_id: body.merchant_id ? String(body.merchant_id) : null,
          created_by: userId,
          latest_message_preview: null,
          latest_message_type: null,
          last_message_at: now,
          created_at: now,
          updated_at: now,
        },
      });

      return ok(mapConversation(conversation));
    });

    fastify.get('/ai/conversations/:id', async (request, reply) => {
      const { id } = request.params as { id: string };
      const conversation = await getConversation(prisma, id);

      if (!conversation) {
        reply.code(404);
        return err(404, 'Conversation not found');
      }

      return ok(mapConversation(conversation));
    });

    fastify.get('/ai/conversations/:id/messages', async (request, reply) => {
      const { id } = request.params as { id: string };
      const conversation = await getConversation(prisma, id);

      if (!conversation) {
        reply.code(404);
        return err(404, 'Conversation not found');
      }

      const rows = await prisma.aiConversationMessage.findMany({
        where: { conversation_id: id },
        orderBy: { created_at: 'asc' },
      });

      return ok(rows.map(mapMessage));
    });

    fastify.post('/ai/conversations/:id/messages', async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = (request.body as Record<string, unknown> | undefined) || {};
      const conversation = await ensureConversation(prisma, id, getUserId(request), body);

      const question = String(body.question || body.content || '').trim();
      if (!question) {
        reply.code(400);
        return err(400, 'question is required');
      }

      const userMessage = buildMessage({
        conversationId: id,
        role: 'user',
        messageType: 'text',
        content: question,
      });

      const aiResponse = await fastify.inject({
        method: 'POST',
        url: '/api/v1/ai/query',
        payload: {
          question,
          merchantId: body.merchantId || conversation.merchant_id || undefined,
        },
      });

      if (aiResponse.statusCode >= 400) {
        reply.code(aiResponse.statusCode);
        return aiResponse.json();
      }

      const aiBody = aiResponse.json() as ApiResponse<{
        answer: string;
        sql?: string;
        records?: unknown[];
      }>;

      const assistantMessage = buildMessage({
        conversationId: id,
        role: 'assistant',
        messageType: 'sql_result',
        content: aiBody.data.answer || '',
        sqlText: aiBody.data.sql || null,
        metaJson: { records: aiBody.data.records || [] },
      });

      await appendMessages(prisma, userMessage, assistantMessage);

      return ok({
        user_message: mapMessage({ ...userMessage, created_at: new Date() }),
        assistant_message: mapMessage({ ...assistantMessage, created_at: new Date() }),
      });
    });

    fastify.post('/ai/conversations/:id/file-notices', async (request) => {
      const { id } = request.params as { id: string };
      const body = (request.body as Record<string, unknown> | undefined) || {};
      await ensureConversation(prisma, id, getUserId(request), body);

      const files = normalizeFiles(body).map((item) => ({
        file_id: String(item.file_id || ''),
        filename: String(item.filename || item.file_name || ''),
        type: String(item.type || item.file_type || ''),
        records: Number(item.records || 0),
        source_label: item.source_label ? String(item.source_label) : undefined,
        source_kind: item.source_kind ? String(item.source_kind) : undefined,
        detection_confidence:
          typeof item.detection_confidence === 'number'
            ? item.detection_confidence
            : item.detection_confidence
              ? Number(item.detection_confidence)
              : undefined,
        channel_primary_key: item.channel_primary_key
          ? String(item.channel_primary_key)
          : undefined,
        channel_amount_unit:
          item.channel_amount_unit === 'fen' || item.channel_amount_unit === 'yuan'
            ? String(item.channel_amount_unit)
            : undefined,
      }));

      if (files.length === 0) {
        return err(400, 'files are required');
      }

      const notice = buildMessage({
        conversationId: id,
        role: 'assistant',
        messageType: 'file_notice',
        content: resolveNoticeContent(files),
        metaJson: { files },
      });

      await appendMessages(prisma, notice);
      return ok(mapMessage({ ...notice, created_at: new Date() }));
    });

    fastify.post('/ai/conversations/:id/reconcile', async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = (request.body as Record<string, unknown> | undefined) || {};
      await ensureConversation(prisma, id, getUserId(request), body);

      const reconcileResponse = await fastify.inject({
        method: 'POST',
        url: '/api/v1/ai/reconcile',
        payload: body,
      });

      if (reconcileResponse.statusCode >= 400) {
        reply.code(reconcileResponse.statusCode);
        return reconcileResponse.json();
      }

      const reconcileBody = reconcileResponse.json() as ApiResponse<{
        batch_id: string;
        batch_no: string;
        stats: Record<string, unknown>;
        message?: string;
      }>;

      const assistantMessage = buildMessage({
        conversationId: id,
        role: 'assistant',
        messageType: 'reconcile_result',
        content: reconcileBody.data.message || `对账完成，批次号 ${reconcileBody.data.batch_no}`,
        metaJson: {
          batch_id: reconcileBody.data.batch_id,
          batch_no: reconcileBody.data.batch_no,
          stats: reconcileBody.data.stats,
        },
      });

      await appendMessages(prisma, assistantMessage);

      return ok({
        batch_id: reconcileBody.data.batch_id,
        batch_no: reconcileBody.data.batch_no,
        stats: reconcileBody.data.stats,
        message: mapMessage({ ...assistantMessage, created_at: new Date() }),
      });
    });

    fastify.delete('/ai/conversations/:id', async (request, reply) => {
      const { id } = request.params as { id: string };
      const conversation = await getConversation(prisma, id);

      if (!conversation) {
        reply.code(404);
        return err(404, 'Conversation not found');
      }

      await prisma.aiConversation.delete({ where: { id } });
      return ok({ deleted: true });
    });
  };
};
