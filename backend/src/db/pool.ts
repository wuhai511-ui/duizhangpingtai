/**
 * 数据库连接池管理
 */
import pg from 'pg';
import type { DatabaseConfig, Pool, PoolClient } from '../types/database.js';

const { Pool: PgPool } = pg;

/**
 * 创建数据库连接池
 */
export function createPool(config: DatabaseConfig): Pool {
  const pool = new PgPool({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    max: config.max,
  });

  return {
    connect: async (): Promise<PoolClient> => {
      const client = await pool.connect();
      return {
        query: (sql, params) => client.query(sql, params),
        release: () => client.release(),
      };
    },
    query: (sql, params) => pool.query(sql, params),
    end: () => pool.end(),
  };
}

/**
 * 测试数据库连接
 */
export async function testConnection(pool: Pool): Promise<boolean> {
  try {
    const result = await pool.query('SELECT NOW()');
    return result.rows.length > 0;
  } catch {
    return false;
  }
}
