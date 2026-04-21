import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, afterAll } from 'vitest';

if (!process.env.DATABASE_URL) {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const sqlitePath = path.resolve(currentDir, '../prisma/test.db').replace(/\\/g, '/');
  process.env.DATABASE_URL = `file:${sqlitePath}`;
}
beforeAll(() => {});
afterAll(() => {});
