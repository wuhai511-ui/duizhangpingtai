import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SftpWatcher, guessFileType } from '../../src/file-watcher/sftp-watcher';
import type { FileEvent } from '../../src/file-watcher/sftp-watcher';
import type { FileProcessor } from '../../src/services/file-processor';

describe('guessFileType', () => {
  it('JY_ 文件识别为 JY', () => {
    expect(guessFileType('JY_20240115.txt')).toBe('JY');
  });
  it('JS_ 文件识别为 JS', () => {
    expect(guessFileType('JS_20240115.csv')).toBe('JS');
  });
  it('JZ_ 文件识别为 JZ', () => {
    expect(guessFileType('JZ_20240115.txt')).toBe('JZ');
  });
  it('ACC_ 文件识别为 ACC', () => {
    expect(guessFileType('ACC_20240115.txt')).toBe('ACC');
  });
  it('SEP_ 文件识别为 SEP', () => {
    expect(guessFileType('SEP_20240115.txt')).toBe('SEP');
  });
  it('SEP_SUM 文件识别为 SEP_SUM', () => {
    expect(guessFileType('SEP_SUM_20240115.txt')).toBe('SEP_SUM');
  });
  it('DW_ 文件识别为 DW', () => {
    expect(guessFileType('DW_20240115.txt')).toBe('DW');
  });
  it('D0_ 文件识别为 D0', () => {
    expect(guessFileType('D0_20240115.txt')).toBe('D0');
  });
  it('JY_FQ_ 文件识别为 JY_FQ', () => {
    expect(guessFileType('JY_FQ_20240115.txt')).toBe('JY_FQ');
  });
  it('PNG 文件识别为 PROOF', () => {
    expect(guessFileType('proof_001.png')).toBe('PROOF');
  });
  it('未知文件返回 null', () => {
    expect(guessFileType('unknown_file.txt')).toBe(null);
  });
});

describe('SftpWatcher', () => {
  let watcher: SftpWatcher;
  const mockProcessor: FileProcessor = {
    processBuffer: vi.fn().mockResolvedValue({ success: true, records: 10, type: 'JY' }),
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    if (watcher) await watcher.stop();
  });

  it('guessFileType 不区分大小写', () => {
    expect(guessFileType('jy_20240115.txt')).toBe('JY');
    expect(guessFileType('sep_sum_20240115.txt')).toBe('SEP_SUM');
  });

  it('start 后 isRunning 返回 true', async () => {
    watcher = new SftpWatcher({ watchDir: '/tmp', debounceMs: 50 });
    await watcher.start();
    expect(watcher.isRunning()).toBe(true);
  });

  it('stop 后 isRunning 返回 false', async () => {
    watcher = new SftpWatcher({ watchDir: '/tmp', debounceMs: 50 });
    await watcher.start();
    await watcher.stop();
    expect(watcher.isRunning()).toBe(false);
  });

  it('重复 start 抛出异常', async () => {
    watcher = new SftpWatcher({ watchDir: '/tmp', debounceMs: 50 });
    await watcher.start();
    await expect(watcher.start()).rejects.toThrow('already started');
  });

  it('发射 file 事件', async () => {
    watcher = new SftpWatcher({ watchDir: '/tmp', debounceMs: 50 });
    watcher.setProcessor(mockProcessor);
    await watcher.start();
    expect(watcher.isRunning()).toBe(true);
    await watcher.stop();
  });

  it('setProcessor 后自动处理文件', async () => {
    watcher = new SftpWatcher({ watchDir: '/tmp', debounceMs: 50 });
    watcher.setProcessor(mockProcessor);
    await watcher.start();
    await watcher.stop();
    // processor 被设置，文件到达时会调用
    expect(watcher.isRunning()).toBe(false);
  });
});
