/**
 * AI 会话管理 API
 * 支持多轮对话、文件上传、对账等
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

function err(code: number, message: string): ApiResponse<null> {
  return { code, message, data: null };
}

// 内存存储（生产环境应使用数据库）
const conversations = new Map<string, any>();
const messages = new Map<string, any[]>();

export const createAiConversationRoutes = (prisma: PrismaClient): FastifyPluginAsync => {
  return async (fastify) => {
    /** GET /ai/conversations - 获取会话列表 */
    fastify.get('/ai/conversations', async (request) => {
      const userId = (request as any).user?.id || 'anonymous';
      const list = Array.from(conversations.values())
        .filter((c: any) => c.created_by === userId)
        .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      
      return ok(list);
    });

    /** POST /ai/conversations - 创建新会话 */
    fastify.post('/ai/conversations', async (request) => {
      const body = request.body as { title?: string; merchant_id?: string };
      const userId = (request as any).user?.id || 'anonymous';
      
      const conversation = {
        id: `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        title: body.title || '新对话',
        merchant_id: body.merchant_id,
        created_by: userId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      
      conversations.set(conversation.id, conversation);
      messages.set(conversation.id, []);
      
      return ok(conversation);
    });

    /** GET /ai/conversations/:id - 获取会话详情 */
    fastify.get('/ai/conversations/:id', async (request, reply) => {
      const params = request.params as { id: string };
      const conversation = conversations.get(params.id);
      
      if (!conversation) {
        reply.code(404);
        return err(404, 'Conversation not found');
      }
      
      return ok(conversation);
    });

    /** GET /ai/conversations/:id/messages - 获取会话消息 */
    fastify.get('/ai/conversations/:id/messages', async (request, reply) => {
      const params = request.params as { id: string };
      const conversation = conversations.get(params.id);
      
      if (!conversation) {
        reply.code(404);
        return err(404, 'Conversation not found');
      }
      
      const msgs = messages.get(params.id) || [];
      return ok(msgs);
    });

    /** POST /ai/conversations/:id/messages - 发送消息 */
    fastify.post('/ai/conversations/:id/messages', async (request, reply) => {
      const params = request.params as { id: string };
      const body = request.body as { content: string; type?: string };
      const conversation = conversations.get(params.id);
      
      if (!conversation) {
        reply.code(404);
        return err(404, 'Conversation not found');
      }
      
      if (!body.content) {
        reply.code(400);
        return err(400, 'Content is required');
      }
      
      const userMessage = {
        id: `msg_${Date.now()}_user`,
        conversation_id: params.id,
        role: 'user',
        content: body.content,
        type: body.type || 'text',
        created_at: new Date().toISOString(),
      };
      
      const msgs = messages.get(params.id) || [];
      msgs.push(userMessage);
      
      // 模拟 AI 回复
      const aiReply = {
        id: `msg_${Date.now()}_assistant`,
        conversation_id: params.id,
        role: 'assistant',
        content: generateReply(body.content),
        type: 'text',
        created_at: new Date().toISOString(),
      };
      msgs.push(aiReply);
      
      messages.set(params.id, msgs);
      conversation.updated_at = new Date().toISOString();
      
      return ok(aiReply);
    });

    /** POST /ai/conversations/:id/file-notices - 文件通知 */
    fastify.post('/ai/conversations/:id/file-notices', async (request, reply) => {
      const params = request.params as { id: string };
      const body = request.body as { file_id: string; file_name: string; file_type: string };
      const conversation = conversations.get(params.id);
      
      if (!conversation) {
        reply.code(404);
        return err(404, 'Conversation not found');
      }
      
      const notice = {
        id: `notice_${Date.now()}`,
        conversation_id: params.id,
        role: 'system',
        content: `文件已上传: ${body.file_name} (${body.file_type})`,
        type: 'file_notice',
        file_id: body.file_id,
        file_name: body.file_name,
        file_type: body.file_type,
        created_at: new Date().toISOString(),
      };
      
      const msgs = messages.get(params.id) || [];
      msgs.push(notice);
      messages.set(params.id, msgs);
      
      return ok(notice);
    });

    /** POST /ai/conversations/:id/reconcile - 对账 */
    fastify.post('/ai/conversations/:id/reconcile', async (request, reply) => {
      const params = request.params as { id: string };
      const body = request.body as { business_file_id?: string; channel_file_id?: string; template_id?: string };
      const conversation = conversations.get(params.id);
      
      if (!conversation) {
        reply.code(404);
        return err(404, 'Conversation not found');
      }
      
      // 模拟对账结果
      const result = {
        batch_id: `batch_${Date.now()}`,
        batch_no: `BATCH_AI_${Date.now()}`,
        status: 'processing',
        business_file_id: body.business_file_id,
        channel_file_id: body.channel_file_id,
        template_id: body.template_id,
        stats: {
          total: 0,
          match: 0,
          rolling: 0,
          long: 0,
          short: 0,
          amount_diff: 0,
        },
      };
      
      return ok(result);
    });

    /** DELETE /ai/conversations/:id - 删除会话 */
    fastify.delete('/ai/conversations/:id', async (request, reply) => {
      const params = request.params as { id: string };
      
      if (!conversations.has(params.id)) {
        reply.code(404);
        return err(404, 'Conversation not found');
      }
      
      conversations.delete(params.id);
      messages.delete(params.id);
      
      return ok({ deleted: true });
    });
  };
};

// 简单回复生成
function generateReply(content: string): string {
  const lower = content.toLowerCase();
  
  if (lower.includes('对账') || lower.includes('匹配')) {
    return '我可以帮您进行对账操作。请先上传业务订单文件和渠道流水文件，然后告诉我如何进行匹配。';
  }
  if (lower.includes('文件') || lower.includes('上传')) {
    return '请上传需要对账的文件，支持 Excel、CSV 格式。上传后我会分析文件内容。';
  }
  if (lower.includes('查询') || lower.includes('数据')) {
    return '我可以帮您查询交易数据。请告诉我您想查询什么内容。';
  }
  
  return '您好！我是您的业财一体化助手。我可以帮您：\n1. 上传并识别对账文件\n2. 配置对账规则\n3. 执行对账操作\n4. 查询交易数据\n\n请问有什么可以帮您？';
}
