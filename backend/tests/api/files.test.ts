import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { createFileRoutes } from '../../src/api/routes/file.js';

// Mock FileProcessor - 只测 GET 路由（不依赖 Prisma）
function buildApp() {
  const app = Fastify();
  // FileProcessor 依赖 Prisma，GET routes 不需要，写入才需要
  // 用一个最小化 mock，只实现 listFiles/getFile 方法
  const mockProcessor = {
    processBuffer: async () => ({ success: true, fileId: 'test', records: 0 }),
    listFiles: () => ({ items: [], total: 0 }),
    getFile: () => null,
    getFileRecords: () => null,
  } as any;
  app.register(createFileRoutes(mockProcessor), { prefix: '/api/v1' });
  return app;
}

describe('GET /api/v1/files', () => {
  it('returns empty list initially', async () => {
    const app = buildApp();
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/api/v1/files' });
    const body = JSON.parse(res.payload);

    expect(res.statusCode).toBe(200);
    expect(body.code).toBe(0);
    expect(body.data).toEqual([]);
    expect(body.pagination).toBeDefined();
    expect(body.pagination.total).toBe(0);
  });

  it('returns paginated list', async () => {
    const app = buildApp();
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/api/v1/files?page=1&pageSize=10' });
    const body = JSON.parse(res.payload);

    expect(res.statusCode).toBe(200);
    expect(body.code).toBe(0);
    expect(body.pagination).toMatchObject({ page: 1, pageSize: 10 });
  });

  it('filters by fileType', async () => {
    const app = buildApp();
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/api/v1/files?fileType=JY' });
    const body = JSON.parse(res.payload);

    expect(res.statusCode).toBe(200);
    expect(body.code).toBe(0);
  });
});

describe('GET /api/v1/files/:id', () => {
  it('returns 404 for unknown id', async () => {
    const app = buildApp();
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/api/v1/files/unknown-id' });
    const body = JSON.parse(res.payload);

    expect(res.statusCode).toBe(404);
    expect(body.code).toBe(4);
  });
});

describe('GET /api/v1/files/guess', () => {
  it('guesses JY file type', async () => {
    const app = buildApp();
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/api/v1/files/guess?filename=JY_20240115.dat' });
    const body = JSON.parse(res.payload);

    expect(res.statusCode).toBe(200);
    expect(body.code).toBe(0);
    expect(body.data.filename).toBe('JY_20240115.dat');
    expect(body.data.guess).toBe('JY');
  });

  it('guesses BUSINESS_ORDER file type', async () => {
    const app = buildApp();
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/api/v1/files/guess?filename=business_order_20240115.txt' });
    const body = JSON.parse(res.payload);

    expect(res.statusCode).toBe(200);
    expect(body.code).toBe(0);
    expect(body.data.guess).toBe('BUSINESS_ORDER');
  });
});
