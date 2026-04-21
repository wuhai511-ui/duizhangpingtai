import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DailyScheduler, reconcileYesterday } from '../../src/scheduler/daily-scheduler';
import type { SchedulerOptions } from '../../src/scheduler/daily-scheduler';

const mockPrisma = {
  jyTransaction: { findMany: vi.fn().mockResolvedValue([]) },
  jsSettlement: { findMany: vi.fn().mockResolvedValue([]) },
  jzWalletSettlement: { findMany: vi.fn().mockResolvedValue([]) },
  accAccountSettlement: { findMany: vi.fn().mockResolvedValue([]) },
  $disconnect: vi.fn(),
};

const mockPool = {
  query: vi.fn().mockResolvedValue({ rows: [] }),
  end: vi.fn(),
};

describe('DailyScheduler', () => {
  let scheduler: DailyScheduler;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    scheduler?.stop();
  });

  it('start 注册 5 个 cron 任务', () => {
    scheduler = new DailyScheduler(mockPrisma as any, mockPool as any, {
      parseDir: '/tmp',
      enableSftpWatcher: false,
    });
    scheduler.start();
    // 5 个任务：6点/7点/10点/12点/0点
    expect(scheduler.getTaskCount()).toBe(5);
  });

  it('stop 后任务数为 0', () => {
    scheduler = new DailyScheduler(mockPrisma as any, mockPool as any, {
      parseDir: '/tmp',
    });
    scheduler.start();
    scheduler.stop();
    expect(scheduler.getTaskCount()).toBe(0);
  });

  it('triggerReconciliation 调用 runDailyReconciliation', async () => {
    scheduler = new DailyScheduler(mockPrisma as any, mockPool as any, {
      parseDir: '/tmp',
    });
    await scheduler.triggerReconciliation('2024-01-15');

    expect(mockPrisma.jyTransaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { trans_date: '2024-01-15' } })
    );
    expect(mockPrisma.jsSettlement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { trans_date: '2024-01-15' } })
    );
  });

  it('构造函数接受默认选项', () => {
    scheduler = new DailyScheduler(mockPrisma as any, mockPool as any, {});
    expect(() => scheduler.start()).not.toThrow();
  });
});

describe('reconcileYesterday', () => {
  it('调用 findMany 查询昨天交易数据', async () => {
    await reconcileYesterday(mockPrisma as any);

    // findMany 应被调用（具体日期由运行时 Date() 决定）
    expect(mockPrisma.jyTransaction.findMany).toHaveBeenCalled();
    expect(mockPrisma.jsSettlement.findMany).toHaveBeenCalled();
    expect(mockPrisma.jzWalletSettlement.findMany).toHaveBeenCalled();
    expect(mockPrisma.accAccountSettlement.findMany).toHaveBeenCalled();
  });
});
