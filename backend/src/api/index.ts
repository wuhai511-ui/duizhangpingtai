import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { PrismaClient } from '@prisma/client';
import { healthRoutes } from './routes/health.js';
import { createFileRoutes } from '../business/routes/file.js';
import { createReconciliationRoutes } from '../business/routes/reconciliation.js';
import { createInvoiceRoutes } from '../business/routes/invoice.js';
import { createTemplateRoutes } from '../business/routes/template.js';
import { merchantRoutes } from '../business/routes/merchant.js';
import { transactionRoutes } from '../business/routes/transaction.js';
import { aiRoutes, createAiFileRoutes, createAiReconcileRoutes } from '../business/routes/ai.js';

import { createBffRoutes } from '../bff/routes/bff.routes.js';
import { createAuthRoutes } from './routes/auth.js';
import { createUserRoutes } from '../business/routes/user.js';
import { FileProcessor } from '../business/services/file-processor.js';
import { ReconciliationEngine } from '../business/services/reconciliation-engine.js';
import { createPool } from '../shared/db/pool.js';

let server: FastifyInstance | null = null;
let processor: FileProcessor | null = null;
let prisma: PrismaClient | null = null;
const engine = new ReconciliationEngine();

/** 空池（测试用，不连接真实数据库） */
const mockPool = {
  query: async () => ({ rows: [] }),
  connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} }),
  end: async () => {},
};

function buildPool() {
  try {
    const url = process.env.DATABASE_URL;
    if (!url) return mockPool as any;
    // 简单解析 postgresql://user:pass@host:port/db
    const match = url.match(/postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
    if (!match) return mockPool as any;
    return createPool({
      host: match[3],
      port: Number(match[4]),
      database: match[5],
      user: match[1],
      password: match[2],
      max: 10,
    });
  } catch {
    return mockPool as any;
  }
}

export async function createServer(): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: false,
  });

  // 初始化 Prisma
  prisma = new PrismaClient();

  // 初始化 FileProcessor
  const pool = buildPool();
  processor = new FileProcessor(pool);
  processor.setPrisma(prisma);

  // 注册插件
  await fastify.register(cors, { origin: true });
  await fastify.register(multipart, {
    limits: {
      fileSize: 50 * 1024 * 1024, // 50MB
      files: 10, // 最多10个文件
    },
  });

  // 注册路由（统一前缀 /api/v1）
  const prefix = '/api/v1';
  await fastify.register(healthRoutes, { prefix });
  await fastify.register(createFileRoutes(processor), { prefix });
  await fastify.register(createReconciliationRoutes(prisma), { prefix });
  await fastify.register(createInvoiceRoutes(prisma), { prefix });
  await fastify.register(createTemplateRoutes(prisma), { prefix });
  await fastify.register(merchantRoutes, { prefix });
  await fastify.register(transactionRoutes, { prefix });
  await fastify.register(createUserRoutes(prisma), { prefix });
  await fastify.register(createAuthRoutes(prisma), { prefix });
  await fastify.register(aiRoutes, { prefix });
  await fastify.register(createAiFileRoutes(processor), { prefix });
  await fastify.register(createAiReconcileRoutes(prisma, engine), { prefix });
  await fastify.register(createBffRoutes(prisma), { prefix });

  return fastify;
}

export async function startServer(port = 3000): Promise<FastifyInstance> {
  const fastify = await createServer();

  try {
    await fastify.listen({ port, host: '0.0.0.0' });
    console.log(`Server listening on port ${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }

  server = fastify;
  return fastify;
}

export function getProcessor(): FileProcessor | null {
  return processor;
}

// Auto-start when run directly with: node dist/api/index.js
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const port = Number(process.env.PORT) || 3000;
  startServer(port).catch(console.error);
}
