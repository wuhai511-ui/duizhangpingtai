/**
 * SQL 查询执行器（Prisma $queryRaw）
 * 支持 PostgreSQL / SQLite
 *
 * 安全策略：
 * - 只允许 SELECT 语句
 * - 禁止 DELETE / DROP / TRUNCATE / ALTER / INSERT / UPDATE
 */
import { prisma } from './prisma.js';

const BLOCKED_KEYWORDS = [
  'DELETE', 'DROP', 'TRUNCATE', 'ALTER', 'INSERT', 'UPDATE',
  'CREATE', 'GRANT', 'REVOKE', 'EXEC', 'EXECUTE',
];

export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
}

function isSafeSQL(sql: string): boolean {
  const upper = sql.toUpperCase().trim();
  if (!upper.startsWith('SELECT')) return false;
  for (const kw of BLOCKED_KEYWORDS) {
    if (upper.includes(kw)) return false;
  }
  return true;
}

/**
 * 执行查询，返回标准化结果
 * @param sql - SELECT 语句
 * @param params - 可选参数数组（用于 Prisma $queryRaw`${sql} ${params}）
 */
export async function query<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<QueryResult> {
  if (!isSafeSQL(sql)) {
    throw new Error('SQL injection detected: only SELECT allowed');
  }

  try {
    // Prisma $queryRaw requires template literal or Prisma.sql
    const { Prisma } = require('@prisma/client');
    const querySql = Prisma.sql([sql]);
    
    const rows = params
      ? await prisma.$queryRaw<T[]>(querySql, ...params)
      : await prisma.$queryRaw<T[]>(querySql);

    const result = Array.isArray(rows) ? rows : [];

    const columns = result.length > 0 ? Object.keys(result[0] as Record<string, unknown>) : [];

    return {
      columns,
      rows: result as Record<string, unknown>[],
      rowCount: result.length,
    };
  } catch (err) {
    // 语法错误或表不存在
    throw new Error(`Query failed: ${(err as Error).message}`);
  }
}

/**
 * 格式化查询结果为自然语言
 */
export function formatResult(result: QueryResult): string {
  if (result.rows.length === 0) {
    return '暂无数据';
  }

  // SUM / COUNT 等聚合
  if (result.columns.length === 1) {
    const col = result.columns[0];
    const val = result.rows[0][col];
    return `查询结果：${val ?? '0'}`;
  }

  // 多列 → 表格
  const lines = result.rows.slice(0, 10).map(row => {
    return result.columns.map(col => `${col}=${row[col]}`).join(', ');
  });

  const suffix = result.rows.length > 10 ? `\n...还有 ${result.rows.length - 10} 行` : '';
  return `查询结果（共 ${result.rowCount} 条）：\n${lines.join('\n')}${suffix}`;
}
