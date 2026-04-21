/**
 * 每日定时调度器
 *
 * 参考 technical-plan.md 定时任务表：
 * D+1 06:00  解析 SEP/SEP_SUM/JY_FQ
 * D+1 07:00  解析 JZ
 * D+1 10:00  解析 ACC
 * D+1 12:00  解析 JS/DW/D0
 * D+1 00:00  触发对账
 */
import cron, { ScheduledTask } from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { FileProcessor } from '../services/file-processor.js';
import { runDailyReconciliation } from '../services/reconciliation.js';
import fs from 'fs/promises';
import path from 'path';

export interface SchedulerOptions {
  /** SFTP 监控目录（可选） */
  sftpWatchDir?: string;
  /** 文件解析目录（定时扫描） */
  parseDir?: string;
  /** 是否启动 SFTP watcher */
  enableSftpWatcher?: boolean;
}

export class DailyScheduler {
  private tasks: ScheduledTask[] = [];
  private prisma: PrismaClient;
  private processor: FileProcessor;
  private sftpWatcher: any = null;
  private options: Required<SchedulerOptions>;

  constructor(prisma: PrismaClient, pool: any, options: SchedulerOptions) {
    this.prisma = prisma;
    this.processor = new FileProcessor(pool);
    this.options = {
      sftpWatchDir: options.sftpWatchDir ?? '/data/sftp/incoming',
      parseDir: options.parseDir ?? '/data/parsed',
      enableSftpWatcher: options.enableSftpWatcher ?? false,
    };
  }

  /** 启动所有定时任务 */
  start(): void {
    // D+1 06:00 — SEP / SEP_SUM / JY_FQ
    this.tasks.push(
      cron.schedule('0 6 * * *', () => this.parseFiles(['SEP', 'SEP_SUM', 'JY_FQ']), {
        scheduled: true,
        timezone: 'Asia/Shanghai',
      })
    );

    // D+1 07:00 — JZ
    this.tasks.push(
      cron.schedule('0 7 * * *', () => this.parseFiles(['JZ']), {
        scheduled: true,
        timezone: 'Asia/Shanghai',
      })
    );

    // D+1 10:00 — ACC
    this.tasks.push(
      cron.schedule('0 10 * * *', () => this.parseFiles(['ACC']), {
        scheduled: true,
        timezone: 'Asia/Shanghai',
      })
    );

    // D+1 12:00 — JS / DW / D0
    this.tasks.push(
      cron.schedule('0 12 * * *', () => this.parseFiles(['JS', 'DW', 'D0']), {
        scheduled: true,
        timezone: 'Asia/Shanghai',
      })
    );

    // D+1 00:00 — 对账
    this.tasks.push(
      cron.schedule('0 0 * * *', () => this.runReconciliation(), {
        scheduled: true,
        timezone: 'Asia/Shanghai',
      })
    );

    console.log(`[Scheduler] Started ${this.tasks.length} cron tasks`);
  }

  /** 停止所有定时任务 */
  stop(): void {
    for (const task of this.tasks) {
      task.stop();
    }
    this.tasks = [];
    console.log('[Scheduler] All tasks stopped');
  }

  /** 获取当前任务数 */
  getTaskCount(): number {
    return this.tasks.length;
  }

  /**
   * 解析指定类型的文件
   * @param fileTypes 如 ['JY', 'JS', 'JZ']
   */
  async parseFiles(fileTypes: string[]): Promise<void> {
    const date = this.yesterday();
    console.log(`[Scheduler] Parsing ${fileTypes.join(',')} for ${date}`);

    try {
      const dir = this.options.parseDir;
      const files = await fs.readdir(dir).catch(() => []);

      for (const file of files) {
        const upper = file.toUpperCase();
        const match = fileTypes.some((t) => upper.startsWith(`${t}_`) || upper.includes(`${t}_`));
        if (!match) continue;

        const content = await fs.readFile(path.join(dir, file), 'utf-8');
        await this.processor.processBuffer(content, file, 'sftp');
        console.log(`[Scheduler] Processed ${file}`);
      }
    } catch (err) {
      console.error(`[Scheduler] parseFiles error:`, err);
    }
  }

  /** 执行 D 日对账 */
  async runReconciliation(): Promise<void> {
    const date = this.yesterday();
    console.log(`[Scheduler] Running reconciliation for ${date}`);

    try {
      await this.processor.setPrisma(this.prisma);
      const result = await runDailyReconciliation(date, this.prisma);
      console.log(
        `[Scheduler] Reconciliation done: total=${result.stats.total} match=${result.stats.match} mismatch=${result.stats.mismatch} missing=${result.stats.missing}`
      );
    } catch (err) {
      console.error(`[Scheduler] Reconciliation error:`, err);
    }
  }

  /** 获取昨天日期 YYYY-MM-DD */
  private yesterday(): string {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }

  /** 手动触发对账（供测试/调试） */
  async triggerReconciliation(date: string): Promise<void> {
    await this.processor.setPrisma(this.prisma);
    await runDailyReconciliation(date, this.prisma);
  }
}

/** 便捷函数：直接运行对账（无需实例化） */
export async function reconcileYesterday(prisma: PrismaClient): Promise<void> {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const date = d.toISOString().slice(0, 10);
  await runDailyReconciliation(date, prisma);
}
