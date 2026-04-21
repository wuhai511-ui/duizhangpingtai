import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from '../../src/api/index.js';

describe('API Server', () => {
  let fastify: Awaited<ReturnType<typeof createServer>>;

  beforeAll(async () => {
    fastify = await createServer();
    await fastify.ready();
  });

  afterAll(async () => {
    await fastify.close();
  });

  describe('Health Routes', () => {
    it('GET /api/v1/health should return ok', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/v1/health',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('ok');
      expect(body.version).toBe('1.0.0');
    });

    it('GET /api/v1/ready should return ready', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/v1/ready',
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('File Routes', () => {
    it('GET /api/v1/files should return list', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/v1/files',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.code).toBe(0);
      expect(body.data).toEqual([]);
    });

    it('GET /api/v1/files/guess should guess file type', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/v1/files/guess?filename=JY_20240115.dat',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.code).toBe(0);
      expect(body.data.guess).toBe('JY');
    });
  });

  describe('Reconciliation Routes', () => {
    it('GET /api/v1/reconciliation/batches should return list', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/v1/reconciliation/batches',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.code).toBe(0);
      expect(body.data).toHaveProperty('list');
      expect(body.data).toHaveProperty('pagination');
    });

    it('POST /api/v1/reconciliation/batches should create batch', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/v1/reconciliation/batches',
        payload: { batch_type: 'ORDER_VS_JY' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.code).toBe(0);
      expect(body.data.batch_no).toBeDefined();
    });
  });
});
