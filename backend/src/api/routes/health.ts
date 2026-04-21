import type { FastifyPluginAsync } from 'fastify';
import { PrismaClient } from '@prisma/client';

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
  if (!process.env.DATABASE_URL) {
    return 'not_configured';
  }
  try {
    const prisma = new PrismaClient();
    await prisma.$queryRaw`SELECT 1`;
    await prisma.$disconnect();
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
      status: dbStatus === 'connected' ? 'ok' : 'degraded',
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

    // 内存使用超过90%时标记为degraded
    if (memoryUsagePercent > 90) {
      response.status = 'degraded';
    }

    const statusCode = response.status === 'ok' ? 200 : 503;
    return reply.status(statusCode).send(response);
  });

  fastify.get('/ready', async () => {
    return { status: 'ready' };
  });
};
