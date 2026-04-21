import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer } from '../../src/api/index.js';

describe('API Server - AI Conversation Routes', () => {
  let fastify: Awaited<ReturnType<typeof createServer>>;
  let conversationId = '';

  beforeAll(async () => {
    fastify = await createServer();
    await fastify.ready();
  });

  afterAll(async () => {
    await fastify.close();
  });

  it('creates a conversation with frontend-compatible fields', async () => {
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/v1/ai/conversations',
      payload: { title: '测试会话' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.code).toBe(0);
    expect(body.data).toHaveProperty('id');
    expect(body.data).toHaveProperty('last_message_at');
    expect(body.data).toHaveProperty('created_at');
    expect(body.data).toHaveProperty('updated_at');
    conversationId = body.data.id;
  });

  it('returns user_message and assistant_message when sending a message', async () => {
    const res = await fastify.inject({
      method: 'POST',
      url: `/api/v1/ai/conversations/${conversationId}/messages`,
      payload: { question: '今天交易总额多少？' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.code).toBe(0);
    expect(body.data.user_message.message_type).toBe('text');
    expect(body.data.assistant_message.role).toBe('assistant');
    expect(body.data.assistant_message).toHaveProperty('meta_json');
  });

  it('accepts batched file notices in the frontend payload shape', async () => {
    const res = await fastify.inject({
      method: 'POST',
      url: `/api/v1/ai/conversations/${conversationId}/file-notices`,
      payload: {
        files: [
          {
            file_id: 'file_123',
            filename: '业务订单.xlsx',
            type: 'BUSINESS_ORDER',
            records: 12,
            source_label: '业务订单',
          },
        ],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.code).toBe(0);
    expect(body.data.message_type).toBe('file_notice');
    expect(body.data.meta_json.files).toHaveLength(1);
    expect(body.data.meta_json.files[0].filename).toBe('业务订单.xlsx');
  });
});
