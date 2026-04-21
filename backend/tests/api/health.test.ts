import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import { healthRoutes } from '../../src/api/routes/health.js';

describe('Health Routes', () => {
  const app = Fastify({ logger: false });

  beforeAll(async () => {
    await app.register(healthRoutes, { prefix: '/api/v1' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health returns status ok', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
    });
    const body = JSON.parse(res.payload);
    expect(res.statusCode).toBe(200);
    expect(body.status).toBe('ok');
    expect(body).toHaveProperty('timestamp');
    expect(body).toHaveProperty('uptime');
    expect(body).toHaveProperty('version');
  });

  it('GET /api/v1/health includes database status', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
    });
    const body = JSON.parse(res.payload);
    expect(body).toHaveProperty('database');
    expect(['connected', 'disconnected', 'not_configured']).toContain(body.database);
  });

  it('GET /api/v1/health includes memory info', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
    });
    const body = JSON.parse(res.payload);
    expect(body).toHaveProperty('memory');
    expect(body.memory).toHaveProperty('heapUsed');
    expect(body.memory).toHaveProperty('heapTotal');
    expect(body.memory).toHaveProperty('usagePercent');
    expect(typeof body.memory.heapUsed).toBe('number');
    expect(typeof body.memory.heapTotal).toBe('number');
    expect(typeof body.memory.usagePercent).toBe('number');
  });

  it('GET /api/v1/health returns ISO timestamp', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
    });
    const body = JSON.parse(res.payload);
    expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('GET /api/v1/ready returns ready status', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/ready',
    });
    const body = JSON.parse(res.payload);
    expect(res.statusCode).toBe(200);
    expect(body.status).toBe('ready');
  });
});
