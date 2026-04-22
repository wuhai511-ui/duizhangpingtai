import fs from 'fs';
import path from 'path';
import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '../../db/prisma.js';

const VERSION = process.env.npm_package_version || '1.0.0';
const START_TIME = Date.now();

interface HealthResponse {
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
  uptime: number;
  version: string;
  database: 'connected' | 'disconnected' | 'not_configured';
  memory: {
    heapUsed: number;
    heapTotal: number;
    usagePercent: number;
  };
}

async function checkDatabase(): Promise<'connected' | 'disconnected' | 'not_configured'> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return 'not_configured';
  }

  try {
    if (databaseUrl.startsWith('file:')) {
      const relativePath = databaseUrl.slice('file:'.length);
      const absolutePath = path.resolve(process.cwd(), relativePath);
      if (!fs.existsSync(absolutePath)) {
        return 'disconnected';
      }
    }

    await prisma.$connect();
    return 'connected';
  } catch {
    return 'disconnected';
  }
}

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/health', async (_request, reply) => {
    const mem = process.memoryUsage();
    const memoryUsagePercent = (mem.heapUsed / mem.heapTotal) * 100;
    const dbStatus = await checkDatabase();

    const response: HealthResponse = {
      status: dbStatus === 'disconnected' ? 'degraded' : 'ok',
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - START_TIME) / 1000),
      version: VERSION,
      database: dbStatus,
      memory: {
        heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
        usagePercent: Math.round(memoryUsagePercent * 100) / 100,
      },
    };

    const statusCode = response.status === 'ok' ? 200 : 503;
    return reply.status(statusCode).send(response);
  });

  fastify.get('/ready', async () => {
    return { status: 'ready' };
  });
};
