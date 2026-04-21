import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ReconciliationService,
  runDailyReconciliation,
  findUnsettledTransactions,
  findExtraSettlements,
  DiffType,
} from '../../src/services/reconciliation';

const mockPool = {
  query: vi.fn(),
  connect: async () => ({
    query: async () => ({ rows: [] }),
    release: () => {},
  }),
  end: async () => {},
};

const mockPrisma = {
  merchant: { findUnique: vi.fn() },
  jyTransaction: {
    findMany: vi.fn(),
    count: vi.fn(),
  },
  jsSettlement: {
    findMany: vi.fn(),
    count: vi.fn(),
  },
  jzWalletSettlement: { findMany: vi.fn() },
  accAccountSettlement: { findMany: vi.fn() },
  reconciliationBatch: {
    create: vi.fn(),
    update: vi.fn(),
  },
  $disconnect: vi.fn(),
};

describe('DiffType enum', () => {
  it('包含所有预期类型', () => {
    expect(DiffType.MATCH).toBe('match');
    expect(DiffType.AMOUNT_MISMATCH).toBe('amount_mismatch');
    expect(DiffType.MISSING_IN_SETTLEMENT).toBe('missing_in_settlement');
    expect(DiffType.MISSING_IN_TRANSACTION).toBe('missing_in_transaction');
  });
});

describe('ReconciliationService', () => {
  let service: ReconciliationService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ReconciliationService(mockPool as any, mockPrisma as any);
  });

  describe('reconcile (full flow)', () => {
    it('返回包含统计的对账结果', async () => {
      // 模拟：2 笔交易，1 笔结算匹配，1 笔金额差异
      mockPrisma.jyTransaction.findMany.mockResolvedValue([
        {
          merchantId: 'm1',
          lakala_serial: 'L001',
          amount: BigInt(10000),
          settle_amount: BigInt(9900),
          merchant_order_no: 'O001',
          trans_date: '20240115',
        },
        {
          merchantId: 'm1',
          lakala_serial: 'L002',
          amount: BigInt(20000),
          settle_amount: BigInt(19800),
          merchant_order_no: 'O002',
          trans_date: '20240115',
        },
      ]);

      mockPrisma.jsSettlement.findMany.mockResolvedValue([
        {
          merchantId: 'm1',
          lakala_serial: 'L001',
          amount: BigInt(10000),
          settle_amount: BigInt(9900),
          settle_date: '20240115',
        },
        {
          merchantId: 'm1',
          lakala_serial: 'L002',
          amount: BigInt(19000), // 金额不一致！
          settle_amount: BigInt(18800),
          settle_date: '20240115',
        },
      ]);

      const results = await service.reconcile('2024-01-15');

      expect(results.stats.total).toBe(2);
      expect(results.stats.match).toBe(1); // L001 匹配
      expect(results.stats.mismatch).toBe(1); // L002 金额不一致
      expect(results.diffs.length).toBe(1);
      expect(results.diffs[0].diffType).toBe(DiffType.AMOUNT_MISMATCH);
      expect(results.diffs[0].jyAmount).toBe(20000n);
      expect(results.diffs[0].jsAmount).toBe(19000n);
    });

    it('JY有但JS无 → missing_in_settlement', async () => {
      mockPrisma.jyTransaction.findMany.mockResolvedValue([
        {
          merchantId: 'm1',
          lakala_serial: 'L003',
          amount: BigInt(30000),
          settle_amount: BigInt(29700),
          merchant_order_no: 'O003',
          trans_date: '20240115',
        },
      ]);
      mockPrisma.jsSettlement.findMany.mockResolvedValue([]); // 无结算

      const results = await service.reconcile('2024-01-15');

      expect(results.stats.total).toBe(1);
      expect(results.stats.missing).toBe(1);
      expect(results.diffs[0].diffType).toBe(DiffType.MISSING_IN_SETTLEMENT);
    });

    it('JS有但JY无 → missing_in_transaction', async () => {
      mockPrisma.jyTransaction.findMany.mockResolvedValue([]);
      mockPrisma.jsSettlement.findMany.mockResolvedValue([
        {
          merchantId: 'm1',
          lakala_serial: 'L004',
          amount: BigInt(50000),
          settle_amount: BigInt(49500),
          settle_date: '20240115',
        },
      ]);

      const results = await service.reconcile('2024-01-15');

      expect(results.stats.total).toBe(1);
      expect(results.stats.missing).toBe(1);
      expect(results.diffs[0].diffType).toBe(DiffType.MISSING_IN_TRANSACTION);
    });
  });

  describe('runDailyReconciliation standalone', () => {
    it('返回 ReconResult 结构', async () => {
      mockPrisma.jyTransaction.findMany.mockResolvedValue([]);
      mockPrisma.jsSettlement.findMany.mockResolvedValue([]);
      mockPrisma.jzWalletSettlement.findMany.mockResolvedValue([]);
      mockPrisma.accAccountSettlement.findMany.mockResolvedValue([]);

      const results = await runDailyReconciliation('2024-01-15', mockPrisma as any);

      expect(results).toHaveProperty('checkDate');
      expect(results).toHaveProperty('stats');
      expect(results).toHaveProperty('diffs');
      expect(results.stats.total).toBe(0);
    });
  });
});

describe('findUnsettledTransactions', () => {
  it('找出有交易但无结算的记录', () => {
    const transactions = [
      { lakala_serial: 'L001', amount: 10000n },
      { lakala_serial: 'L002', amount: 20000n },
    ];
    const settlements = [
      { lakala_serial: 'L001', amount: 10000n },
    ];

    const result = findUnsettledTransactions(transactions as any, settlements as any);

    expect(result.length).toBe(1);
    expect(result[0].lakala_serial).toBe('L002');
  });

  it('空结算列表 → 所有交易都未结算', () => {
    const transactions = [
      { lakala_serial: 'L001', amount: 10000n },
    ];

    const result = findUnsettledTransactions(transactions as any, [] as any);

    expect(result.length).toBe(1);
  });

  it('空交易列表 → 返回空', () => {
    const result = findUnsettledTransactions([] as any, [] as any);
    expect(result.length).toBe(0);
  });
});

describe('findExtraSettlements', () => {
  it('找出有结算但无交易的记录', () => {
    const transactions = [
      { lakala_serial: 'L001', amount: 10000n },
    ];
    const settlements = [
      { lakala_serial: 'L001', amount: 10000n },
      { lakala_serial: 'L002', amount: 30000n },
    ];

    const result = findExtraSettlements(transactions as any, settlements as any);

    expect(result.length).toBe(1);
    expect(result[0].lakala_serial).toBe('L002');
  });
});
