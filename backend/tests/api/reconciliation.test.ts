import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from '../../src/api/index.js';

describe('API Server - Reconciliation Routes', () => {
  let fastify: Awaited<ReturnType<typeof createServer>>;

  beforeAll(async () => {
    fastify = await createServer();
    await fastify.ready();
  });

  afterAll(async () => {
    await fastify.close();
  });

  describe('GET /api/v1/reconciliation/batches', () => {
    it('returns batch list', async () => {
      const res = await fastify.inject({
        method: 'GET',
        url: '/api/v1/reconciliation/batches',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.code).toBe(0);
      // 响应格式: { code, message, data: { list: [], pagination: {} } }
      expect(body.data).toHaveProperty('list');
      expect(body.data).toHaveProperty('pagination');
    });

    it('supports pagination', async () => {
      const res = await fastify.inject({
        method: 'GET',
        url: '/api/v1/reconciliation/batches?page=2&pageSize=10',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.pagination).toMatchObject({ page: 2, pageSize: 10 });
    });
  });

  describe('POST /api/v1/reconciliation/batches', () => {
    it('creates a batch', async () => {
      const res = await fastify.inject({
        method: 'POST',
        url: '/api/v1/reconciliation/batches',
        payload: {
          batch_type: 'ORDER_VS_JY',
          check_date: '2026-04-05',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.code).toBe(0);
      expect(body.data.batch_no).toBeDefined();
    });

    it('rejects invalid batch_type', async () => {
      const res = await fastify.inject({
        method: 'POST',
        url: '/api/v1/reconciliation/batches',
        payload: { batch_type: 'INVALID' },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.payload);
      expect(body.code).toBe(1);
    });
  });
});
