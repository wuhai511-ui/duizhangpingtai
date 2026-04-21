import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const prismaDir = path.resolve(currentDir, '../prisma');
const sourceDb = path.join(prismaDir, 'dev.db');
const targetDb = path.join(prismaDir, 'test.db');

await fs.copyFile(sourceDb, targetDb);
