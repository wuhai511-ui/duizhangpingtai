import type { FastifyPluginAsync } from 'fastify';
import type { PrismaClient } from '@prisma/client';

interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data: T;
}

interface ConversationRecord {
  id: string;
  title: string;
  merchant_id?: string | null;
  created_by?: string | null;
  latest_message_preview?: string | null;
  latest_message_type?: string | null;
  last_message_at: string;
  created_at: string;
  updated_at: string;
}

interface ConversationMessage {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  message_type: 'text' | 'sql_result' | 'file_notice' | 'reconcile_result';
  content: string;
  sql_text?: string | null;
  meta_json?: Record<string, unknown> | null;
  created_at: string;
}

function ok<T>(data: T): ApiResponse<T> {
  return { code: 0, message: 'success', data };
}

function err(code: number, message: string): ApiResponse<null> {
  return { code, message, data: null };
}

const conversations = new Map<string, ConversationRecord>();
const messages = new Map<string, ConversationMessage[]>();

function getUserId(request: any): string {
  return request.user?.id || 'anonymous';
}

function syncConversation(conversationId: string): ConversationRecord | undefined {
  const conversation = conversations.get(conversationId);
  if (!conversation) {
    return undefined;
  }

  const conversationMessages = messages.get(conversationId) || [];
  const lastMessage = conversationMessages[conversationMessages.length - 1];

  if (lastMessage) {
    conversation.updated_at = lastMessage.created_at;
    conversation.last_message_at = lastMessage.created_at;
    conversation.latest_message_preview =
      lastMessage.content.length > 120
        ? `${lastMessage.content.slice(0, 120)}...`
        : lastMessage.content;
    conversation.latest_message_type = lastMessage.message_type;
  }

  return conversation;
}

function appendMessages(conversationId: string, ...items: ConversationMessage[]) {
  const current = messages.get(conversationId) || [];
  current.push(...items);
  messages.set(conversationId, current);
  syncConversation(conversationId);
}

function buildMessage(params: {
  conversationId: string;
  role: 'user' | 'assistant';
  messageType: ConversationMessage['message_type'];
  content: string;
  sqlText?: string | null;
  metaJson?: Record<string, unknown> | null;
}): ConversationMessage {
  return {
    id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    conversation_id: params.conversationId,
    role: params.role,
    message_type: params.messageType,
    content: params.content,
    sql_text: params.sqlText ?? null,
    meta_json: params.metaJson ?? null,
    created_at: new Date().toISOString(),
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

export const createAiConversationRoutes = (_prisma: PrismaClient): FastifyPluginAsync => {
  return async (fastify) => {
    fastify.get('/ai/conversations', async (request) => {
      const userId = getUserId(request);
      const list = Array.from(conversations.values())
        .filter((item) => item.created_by === userId)
        .map((item) => syncConversation(item.id) || item)
        .sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime());

      return ok(list);
    });

    fastify.post('/ai/conversations', async (request) => {
      const body = (request.body as Record<string, unknown> | undefined) || {};
      const userId = getUserId(request);
      const now = new Date().toISOString();
      const conversation: ConversationRecord = {
        id: `conv_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
        title: String(body.title || '新会话'),
        merchant_id: body.merchant_id ? String(body.merchant_id) : null,
        created_by: userId,
        latest_message_preview: null,
        latest_message_type: null,
        last_message_at: now,
        created_at: now,
        updated_at: now,
      };

      conversations.set(conversation.id, conversation);
      messages.set(conversation.id, []);

      return ok(conversation);
    });

    fastify.get('/ai/conversations/:id', async (request, reply) => {
      const { id } = request.params as { id: string };
      const conversation = syncConversation(id);

      if (!conversation) {
        reply.code(404);
        return err(404, 'Conversation not found');
      }

      return ok(conversation);
    });

    fastify.get('/ai/conversations/:id/messages', async (request, reply) => {
      const { id } = request.params as { id: string };
      const conversation = conversations.get(id);

      if (!conversation) {
        reply.code(404);
        return err(404, 'Conversation not found');
      }

      return ok(messages.get(id) || []);
    });

    fastify.post('/ai/conversations/:id/messages', async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = (request.body as Record<string, unknown> | undefined) || {};
      const conversation = conversations.get(id);

      if (!conversation) {
        reply.code(404);
        return err(404, 'Conversation not found');
      }

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

      const aiPayload = {
        question,
        merchantId: body.merchantId || conversation.merchant_id || undefined,
      };
      const aiResponse = await fastify.inject({
        method: 'POST',
        url: '/api/v1/ai/query',
        payload: aiPayload,
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

      appendMessages(id, userMessage, assistantMessage);

      return ok({
        user_message: userMessage,
        assistant_message: assistantMessage,
      });
    });

    fastify.post('/ai/conversations/:id/file-notices', async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = (request.body as Record<string, unknown> | undefined) || {};
      const conversation = conversations.get(id);

      if (!conversation) {
        reply.code(404);
        return err(404, 'Conversation not found');
      }

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
      }));

      if (files.length === 0) {
        reply.code(400);
        return err(400, 'files are required');
      }

      const notice = buildMessage({
        conversationId: id,
        role: 'assistant',
        messageType: 'file_notice',
        content: resolveNoticeContent(files),
        metaJson: { files },
      });

      appendMessages(id, notice);

      return ok(notice);
    });

    fastify.post('/ai/conversations/:id/reconcile', async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = (request.body as Record<string, unknown> | undefined) || {};
      const conversation = conversations.get(id);

      if (!conversation) {
        reply.code(404);
        return err(404, 'Conversation not found');
      }

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

      appendMessages(id, assistantMessage);

      return ok({
        batch_id: reconcileBody.data.batch_id,
        batch_no: reconcileBody.data.batch_no,
        stats: reconcileBody.data.stats,
        message: assistantMessage,
      });
    });

    fastify.delete('/ai/conversations/:id', async (request, reply) => {
      const { id } = request.params as { id: string };
      const conversation = conversations.get(id);

      if (!conversation) {
        reply.code(404);
        return err(404, 'Conversation not found');
      }

      conversations.delete(id);
      messages.delete(id);

      return ok({ deleted: true });
    });
  };
};
