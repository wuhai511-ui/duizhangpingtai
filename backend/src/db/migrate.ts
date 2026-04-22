import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { fileURLToPath } from 'url';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '../..');
const schemaPath = path.join(backendRoot, 'prisma', 'schema.prisma');

function getDatabaseUrl(): string {
  return process.env.DATABASE_URL || 'postgresql://localhost:5432/yewu_dev';
}

function isSqlite(url: string): boolean {
  return url.startsWith('file:');
}

function runPrismaDbPush() {
  const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  execFileSync(
    npxCommand,
    ['prisma', 'db', 'push', '--schema', schemaPath, '--skip-generate'],
    {
      cwd: backendRoot,
      stdio: 'inherit',
      env: process.env,
    },
  );
}

async function runPostgresMigrations(databaseUrl: string) {
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(migrationsDir).sort();

    for (const file of files) {
      if (!file.endsWith('.sql')) {
        continue;
      }

      console.log(`Running migration: ${file}`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      await pool.query(sql);
      console.log(`OK ${file} completed`);
    }

    console.log('OK All PostgreSQL migrations completed');
  } finally {
    await pool.end();
  }
}

async function migrate() {
  const databaseUrl = getDatabaseUrl();

  try {
    if (isSqlite(databaseUrl)) {
      console.log('Detected SQLite database, applying schema with prisma db push');
      runPrismaDbPush();
      console.log('OK SQLite schema synchronized');
      return;
    }

    await runPostgresMigrations(databaseUrl);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

void migrate();
