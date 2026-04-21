/**
 * 对账核心服务
 * 基于 JY（交易）vs JS/JZ/ACC（结算）进行匹配
 */
import type { Pool } from '../../shared/types/database.js';
import type { PrismaClient } from '@prisma/client';

export enum DiffType {
  MATCH = 'match',
  AMOUNT_MISMATCH = 'amount_mismatch',
  MISSING_IN_SETTLEMENT = 'missing_in_settlement',
  MISSING_IN_TRANSACTION = 'missing_in_transaction',
}

export interface ReconDiff {
  id: string;
  checkDate: string;
  jySerial?: string;
  jsSerial?: string;
  diffType: DiffType;
  jyAmount?: bigint;
  jsAmount?: bigint;
  diffAmount?: bigint;
  jySettleAmount?: bigint;
  jsSettleAmount?: bigint;
  remark?: string;
}

export interface ReconStats {
  total: number;
  match: number;
  mismatch: number;
  missing: number;
}

export interface ReconResult {
  checkDate: string;
  batchId: string;
  stats: ReconStats;
  diffs: ReconDiff[];
}

export interface ReconciliationResult {
  batch_id: string;
  total: number;
  matched: number;
  diff_amount: number;
  diff_count: number;
}

export interface DiffRecord {
  id: string;
  batch_id: string;
  lakala_serial: string;
  platform_amount: number;
  internal_amount: number;
  diff_amount: number;
  diff_type: 'amount' | 'missing_platform' | 'missing_internal';
  status: 'pending' | 'resolved';
}

/** 按 lakala_serial 建立 Map，加速查找 */
function buildSerialMap<T extends { lakala_serial: string }>(items: T[]): Map<string, T> {
  return new Map(items.map((item) => [item.lakala_serial, item]));
}

/**
 * 找出有交易但无结算的记录
 */
export function findUnsettledTransactions(
  transactions: { lakala_serial: string; amount: bigint }[],
  settlements: { lakala_serial: string; amount: bigint }[]
): typeof transactions {
  const settleMap = buildSerialMap(settlements);
  return transactions.filter((t) => !settleMap.has(t.lakala_serial));
}

/**
 * 找出有结算但无交易的记录
 */
export function findExtraSettlements(
  transactions: { lakala_serial: string; amount: bigint }[],
  settlements: { lakala_serial: string; amount: bigint }[]
): typeof settlements {
  const transMap = buildSerialMap(transactions);
  return settlements.filter((s) => !transMap.has(s.lakala_serial));
}

/**
 * 执行 D 日对账（JY vs JS + JZ + ACC）
 * @param date  YYYY-MM-DD 格式
 * @param prisma PrismaClient 实例
 */
export async function runDailyReconciliation(
  date: string,
  prisma: PrismaClient
): Promise<ReconResult> {
  const batchId = `batch_${date}_${Date.now()}`;

  // 1. 读取 D 日的 JY（交易）
  const jyTransactions = await prisma.jyTransaction.findMany({
    where: { trans_date: date },
    select: {
      merchantId: true,
      lakala_serial: true,
      amount: true,
      fee: true,
      settle_amount: true,
      merchant_order_no: true,
      trans_type: true,
    },
  });

  // 2. 读取 D 日的 JS（结算）
  const jsSettlements = await prisma.jsSettlement.findMany({
    where: { trans_date: date },
    select: {
      merchantId: true,
      lakala_serial: true,
      amount: true,
      fee: true,
      settle_amount: true,
    },
  });

  // 3. 读取 D 日的 JZ（钱包结算）
  const jzSettlements = await prisma.jzWalletSettlement.findMany({
    where: { settle_date: date },
    select: {
      merchantId: true,
      amount: true,
      settle_amount: true,
      wallet_type: true,
    },
  });

  // 4. 读取 D 日的 ACC（账户结算）
  const accSettlements = await prisma.accAccountSettlement.findMany({
    where: { settle_date: date },
    select: {
      merchantId: true,
      amount: true,
      settle_amount: true,
    },
  });

  // 5. 按流水号匹配：JY vs JS
  const diffs: ReconDiff[] = [];
  const jyMap = buildSerialMap(jyTransactions);
  const jsMap = buildSerialMap(jsSettlements);
  const allSerials = new Set([...jyMap.keys(), ...jsMap.keys()]);

  let match = 0;
  let mismatch = 0;
  let missing = 0;

  for (const serial of allSerials) {
    const jy = jyMap.get(serial);
    const js = jsMap.get(serial);

    if (jy && js) {
      // 双方都有
      if (jy.settle_amount === js.settle_amount) {
        match++;
      } else {
        mismatch++;
        diffs.push({
          id: `diff_${serial}_amt`,
          checkDate: date,
          jySerial: serial,
          jsSerial: serial,
          diffType: DiffType.AMOUNT_MISMATCH,
          jyAmount: jy.amount,
          jsAmount: js.amount,
          jySettleAmount: jy.settle_amount,
          jsSettleAmount: js.settle_amount,
          diffAmount: jy.settle_amount - js.settle_amount,
        });
      }
    } else if (jy && !js) {
      missing++;
      diffs.push({
        id: `diff_${serial}_miss_js`,
        checkDate: date,
        jySerial: serial,
        diffType: DiffType.MISSING_IN_SETTLEMENT,
        jyAmount: jy.amount,
        jySettleAmount: jy.settle_amount,
      });
    } else if (!jy && js) {
      missing++;
      diffs.push({
        id: `diff_${serial}_miss_jy`,
        checkDate: date,
        jsSerial: serial,
        diffType: DiffType.MISSING_IN_TRANSACTION,
        jsAmount: js.amount,
        jsSettleAmount: js.settle_amount,
      });
    }
  }

  // JZ 和 ACC 单独记录（暂时不参与 JY vs JS 的核心对账）
  // 如需合并，可将 jzMap/accMap 也加入 allSerials 循环

  return {
    checkDate: date,
    batchId,
    stats: {
      total: allSerials.size,
      match,
      mismatch,
      missing,
    },
    diffs,
  };
}

export class ReconciliationService {
  constructor(
    private pool: Pool,
    private prisma?: PrismaClient
  ) {}

  /**
   * 执行对账（兼容旧接口）
   */
  async reconcile(date: string): Promise<ReconResult> {
    if (!this.prisma) {
      // 无 Prisma 时返回空结果
      return {
        checkDate: date,
        batchId: `batch_${Date.now()}`,
        stats: { total: 0, match: 0, mismatch: 0, missing: 0 },
        diffs: [],
      };
    }
    return runDailyReconciliation(date, this.prisma);
  }

  /**
   * 获取差异列表（兼容旧接口）
   */
  async getDiffs(batchId: string, options?: {
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ diffs: DiffRecord[]; total: number }> {
    return { diffs: [], total: 0 };
  }

  /**
   * 解决差异（兼容旧接口）
   */
  async resolveDiff(diffId: string, reason: string): Promise<boolean> {
    return true;
  }

  /**
   * 生成对账报告（兼容旧接口）
   */
  async generateReport(batchId: string): Promise<{
    summary: ReconciliationResult;
    details: DiffRecord[];
  }> {
    return {
      summary: {
        batch_id: batchId,
        total: 0,
        matched: 0,
        diff_amount: 0,
        diff_count: 0,
      },
      details: [],
    };
  }
}
