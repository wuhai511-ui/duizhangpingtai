import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { merchantRoutes } from '../../src/api/routes/merchant.js';

function buildApp() {
  const app = Fastify();
  app.register(merchantRoutes, { prefix: '/api/v1' });
  return app;
}

describe('GET /api/v1/merchants', () => {
  it('returns merchant list', async () => {
    const app = buildApp();
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/api/v1/merchants' });
    const body = JSON.parse(res.payload);

    expect(res.statusCode).toBe(200);
    expect(body.code).toBe(0);
    // 实际响应: { code, message, data: { list: [], pagination: {} } }
    expect(body.data).toHaveProperty('list');
    expect(body.data).toHaveProperty('pagination');
  });

  it('supports pagination', async () => {
    const app = buildApp();
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/api/v1/merchants?page=1&pageSize=10' });
    const body = JSON.parse(res.payload);

    expect(res.statusCode).toBe(200);
    expect(body.data.pagination).toMatchObject({ page: 1, pageSize: 10, total: 0 });
  });

  it('filters by status', async () => {
    const app = buildApp();
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/api/v1/merchants?status=1' });
    const body = JSON.parse(res.payload);

    expect(res.statusCode).toBe(200);
    expect(body.code).toBe(0);
  });
});

describe('POST /api/v1/merchants', () => {
  it('creates a merchant', async () => {
    const app = buildApp();
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/merchants',
      payload: { merchant_no: '888888', name: '测试商户' },
    });
    const body = JSON.parse(res.payload);

    expect(res.statusCode).toBe(200);
    expect(body.code).toBe(0);
    expect(body.data.merchant_no).toBe('888888');
    expect(body.data.id).toBeDefined();
  });

  it('rejects duplicate merchant_no', async () => {
    const app = buildApp();
    await app.ready();

    await app.inject({
      method: 'POST',
      url: '/api/v1/merchants',
      payload: { merchant_no: '999999' },
    });

    const res2 = await app.inject({
      method: 'POST',
      url: '/api/v1/merchants',
      payload: { merchant_no: '999999' },
    });
    const body = JSON.parse(res2.payload);

    expect(res2.statusCode).toBe(409);
    expect(body.code).toBe(2);
  });

  it('rejects missing merchant_no', async () => {
    const app = buildApp();
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/merchants',
      payload: { name: 'no-number' },
    });
    const body = JSON.parse(res.payload);

    expect(res.statusCode).toBe(400);
    expect(body.code).toBe(1);
  });
});

describe('GET /api/v1/merchants/:id', () => {
  it('returns merchant detail', async () => {
    const app = buildApp();
    await app.ready();

    // Create first
    const create = await app.inject({
      method: 'POST',
      url: '/api/v1/merchants',
      payload: { merchant_no: '777777' },
    });
    const { data: { id } } = JSON.parse(create.payload);

    // Then get
    const res = await app.inject({ method: 'GET', url: `/api/v1/merchants/${id}` });
    const body = JSON.parse(res.payload);

    expect(res.statusCode).toBe(200);
    expect(body.data.id).toBe(id);
    expect(body.data.merchant_no).toBe('777777');
  });

  it('returns 404 for unknown id', async () => {
    const app = buildApp();
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/api/v1/merchants/unknown' });
    const body = JSON.parse(res.payload);

    expect(res.statusCode).toBe(404);
    expect(body.code).toBe(4);
  });
});

describe('GET /api/v1/merchants/:id/stats', () => {
  it('returns merchant stats', async () => {
    const app = buildApp();
    await app.ready();

    // Create first
    const create = await app.inject({
      method: 'POST',
      url: '/api/v1/merchants',
      payload: { merchant_no: '666666' },
    });
    const { data: { id } } = JSON.parse(create.payload);

    const res = await app.inject({ method: 'GET', url: `/api/v1/merchants/${id}/stats` });
    const body = JSON.parse(res.payload);

    expect(res.statusCode).toBe(200);
    expect(body.data.merchantId).toBe(id);
    expect(body.data).toHaveProperty('todayTransactions');
    expect(body.data).toHaveProperty('todayAmount');
    expect(body.data).toHaveProperty('pendingReconciliation');
  });

  it('returns 404 for unknown merchant', async () => {
    const app = buildApp();
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/api/v1/merchants/unknown/stats' });
    const body = JSON.parse(res.payload);

    expect(res.statusCode).toBe(404);
    expect(body.code).toBe(4);
  });
});
