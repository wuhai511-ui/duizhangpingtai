/**
 * SFTP 文件监控器
 * 使用 chokidar 监听 SFTP 上传目录，文件到达后触发 Parser 处理
 */
import * as chokidar from 'chokidar';
import { EventEmitter } from 'events';
import path from 'path';
import type { FileProcessor } from '../services/file-processor.js';

export interface SftpWatcherOptions {
  /** 监听目录 */
  watchDir: string;
  /** 文件模式（如 *.txt, JY_*.txt） */
  pattern?: string | string[];
  /** 忽略的前缀（如 .、tmp） */
  ignorePattern?: string | string[];
  /** 延迟处理（ms），等待文件写完 */
  debounceMs?: number;
  /** 是否递归监听子目录 */
  recursive?: boolean;
}

export interface FileEvent {
  type: 'add' | 'change' | 'error';
  filePath: string;
  filename: string;
}

export class SftpWatcher extends EventEmitter {
  private watcher: chokidar.FSWatcher | null = null;
  private debounceTimers = new Map<string, NodeJS.Timeout>();
  private processor: FileProcessor | null = null;
  private options: Required<SftpWatcherOptions>;

  constructor(options: SftpWatcherOptions) {
    super();
    this.options = {
      watchDir: options.watchDir,
      pattern: options.pattern ?? ['*.txt', '*.csv'],
      ignorePattern: options.ignorePattern ?? ['.*', 'tmp_*', '*.tmp'],
      debounceMs: options.debounceMs ?? 2000,
      recursive: options.recursive ?? false,
    };
  }

  /** 注入 FileProcessor 实例 */
  setProcessor(processor: FileProcessor): void {
    this.processor = processor;
  }

  /** 启动监控 */
  async start(): Promise<void> {
    if (this.watcher) {
      throw new Error('Watcher already started');
    }

    const ignorePatterns = Array.isArray(this.options.ignorePattern) 
      ? this.options.ignorePattern 
      : this.options.ignorePattern 
        ? [this.options.ignorePattern] 
        : [];
    const ignore = ignorePatterns.map((p: string) =>
      path.join(this.options.watchDir, p)
    );

    this.watcher = chokidar.watch(this.options.watchDir, {
      persistent: true,
      ignoreInitial: true,
      depth: this.options.recursive ? undefined : 0,
      awaitWriteFinish: {
        stabilityThreshold: this.options.debounceMs,
        pollInterval: 200,
      },
    });

    this.watcher.on('add', (filePath) => this.handleFile(filePath, 'add'));
    this.watcher.on('change', (filePath) => this.handleFile(filePath, 'change'));
    this.watcher.on('error', (error) => this.emit('error', error));
  }

  /** 停止监控 */
  async stop(): Promise<void> {
    for (const t of this.debounceTimers.values()) {
      clearTimeout(t);
    }
    this.debounceTimers.clear();
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }

  /** 获取监控状态 */
  isRunning(): boolean {
    return this.watcher !== null;
  }

  private handleFile(filePath: string, type: 'add' | 'change'): void {
    const filename = path.basename(filePath);

    // 过滤忽略的文件
    for (const ignore of this.options.ignorePattern) {
      if (filename.startsWith(ignore.replace(/^\*/,'.'))) continue;
      if (filename.match(new RegExp(ignore.replace(/\*/g, '.*')))) {
        return;
      }
    }

    // 防抖
    const existing = this.debounceTimers.get(filePath);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(async () => {
      this.debounceTimers.delete(filePath);
      const event: FileEvent = { type, filePath, filename };
      this.emit('file', event);

      if (this.processor) {
        try {
          await this.processFile(filePath, filename);
        } catch (err) {
          this.emit('error', err);
        }
      }
    }, this.options.debounceMs);

    this.debounceTimers.set(filePath, timer);
  }

  private async processFile(filePath: string, filename: string): Promise<void> {
    if (!this.processor) return;

    const fs = await import('fs/promises');
    const content = await fs.readFile(filePath, 'utf-8');
    await this.processor.processBuffer(content, filename, 'sftp');
  }
}

/** 从文件名判断文件类型 */
export function guessFileType(filename: string): string | null {
  const upper = filename.toUpperCase();
  if (upper.includes('JY_FQ') || upper.includes('JFQ')) return 'JY_FQ';
  if (upper.startsWith('JY_')) return 'JY';
  if (upper.startsWith('JS_')) return 'JS';
  if (upper.startsWith('JZ_')) return 'JZ';
  if (upper.startsWith('ACC_')) return 'ACC';
  if (upper.startsWith('SEP_SUM')) return 'SEP_SUM';
  if (upper.startsWith('SEP_')) return 'SEP';
  if (upper.startsWith('DW_')) return 'DW';
  if (upper.startsWith('D0_')) return 'D0';
  // PNG 电子签购单
  if (upper.endsWith('.PNG') || upper.endsWith('.JPG') || upper.endsWith('.JPEG')) return 'PROOF';
  return null;
}
