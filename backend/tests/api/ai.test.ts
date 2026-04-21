import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { aiRoutes } from '../../src/api/routes/ai.js';
import { sanitize } from '../../src/utils/prompt-sanitizer.js';

function buildApp() {
  const app = Fastify();
  app.register(aiRoutes, { prefix: '/api/v1' });
  return app;
}

describe('POST /api/v1/ai/query', () => {
  it('rejects missing question', async () => {
    const app = buildApp();
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/ai/query',
      payload: {},
    });
    const body = JSON.parse(res.payload);

    expect(res.statusCode).toBe(400);
    expect(body.code).toBe(1);
  });

  it('accepts valid question about transaction amount', async () => {
    const app = buildApp();
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/ai/query',
      payload: { question: '昨天商户888888交易总额多少？', merchantId: 'mch_001' },
    });
    const body = JSON.parse(res.payload);

    expect(res.statusCode).toBe(200);
    expect(body.code).toBe(0);
    expect(body.data.answer).toBeDefined();
    expect(body.data.sql).toBeDefined();
    expect(body.data.records).toBeDefined();
  });

  it('accepts valid question about transaction count', async () => {
    const app = buildApp();
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/ai/query',
      payload: { question: '今天交易笔数多少？' },
    });
    const body = JSON.parse(res.payload);

    expect(res.statusCode).toBe(200);
    expect(body.code).toBe(0);
    expect(body.data.answer).toBeDefined();
  });

  it('accepts valid question about refund', async () => {
    const app = buildApp();
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/ai/query',
      payload: { question: '最近有哪些退款记录？' },
    });
    const body = JSON.parse(res.payload);

    expect(res.statusCode).toBe(200);
    expect(body.code).toBe(0);
  });

  it('returns apology for unrecognizable question', async () => {
    const app = buildApp();
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/ai/query',
      payload: { question: '今天天气怎么样？' },
    });
    const body = JSON.parse(res.payload);

    expect(res.statusCode).toBe(200);
    expect(body.code).toBe(0);
    expect(body.data.answer).toContain('抱歉');
  });

  it('uses ApiResponse format', async () => {
    const app = buildApp();
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/ai/query',
      payload: { question: '交易总额多少？' },
    });
    const body = JSON.parse(res.payload);

    expect(body).toHaveProperty('code');
    expect(body).toHaveProperty('message');
    expect(body).toHaveProperty('data');
    expect(body.data).toHaveProperty('answer');
    expect(body.data).toHaveProperty('sql');
    expect(body.data).toHaveProperty('records');
  });
});

describe('prompt sanitizer integration in AI route', () => {
  it('sanitizes template injection attempt', async () => {
    const app = buildApp();
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/ai/query',
      payload: { question: '交易总额多少？{{malicious}}' },
    });
    const body = JSON.parse(res.payload);

    expect(res.statusCode).toBe(200);
    expect(body.code).toBe(0);
  });

  it('sanitizes backtick injection', async () => {
    const sanitized = sanitize('金额 `${malicious}`');
    expect(sanitized).not.toContain('`');
  });

  it('sanitizes {$ injection', async () => {
    const sanitized = sanitize('金额 {${malicious}}');
    expect(sanitized).not.toContain('{$');
  });

  it('sanitizes javascript: pseudo-protocol', async () => {
    const sanitized = sanitize('点击 javascript:alert(1)');
    expect(sanitized).not.toContain('javascript:');
  });

  it('sanitizes onerror= injection', async () => {
    const sanitized = sanitize('<img onerror=alert(1) src=x>');
    expect(sanitized).not.toMatch(/on\w+=/i);
  });

  it('enforces length limit', async () => {
    const long = 'a'.repeat(600);
    const sanitized = sanitize(long);
    expect(sanitized.length).toBeLessThanOrEqual(500);
  });
});
