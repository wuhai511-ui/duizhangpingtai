/**
 * 数据库连接池测试
 */
import { describe, it, expect } from 'vitest';
import { createPool, testConnection } from '../../src/db/pool.js';

describe('Database Pool', () => {
  it('should create pool with config', () => {
    const pool = createPool({
      host: 'localhost',
      port: 5432,
      database: 'test',
      user: 'test',
      password: 'test',
      max: 10,
    });
    expect(pool).toBeDefined();
    expect(pool.query).toBeTypeOf('function');
    expect(pool.connect).toBeTypeOf('function');
    expect(pool.end).toBeTypeOf('function');
  });

  // 注意：实际连接测试需要真实数据库，可以 mock 或跳过
  it.skip('should test connection', async () => {
    // 需要 DATABASE_URL 环境变量
    const pool = createPool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'yewu_dev',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      max: 5,
    });
    
    const isConnected = await testConnection(pool);
    expect(isConnected).toBe(true);
    
    await pool.end();
  });
});
