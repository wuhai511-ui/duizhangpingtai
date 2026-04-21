import { describe, it, expect } from 'vitest';
import { sanitize, isInjection } from '../../src/utils/prompt-sanitizer';

describe('prompt-sanitizer', () => {
  describe('sanitize', () => {
    it('正常输入通过', () => {
      expect(sanitize('查询今日交易')).toBe('查询今日交易');
    });

    it('长度限制 500 字符', () => {
      const result = sanitize('a'.repeat(600));
      expect(result.length).toBe(500);
    });

    it('移除模板注入 {$}', () => {
      expect(sanitize('{$user_prompt}')).not.toContain('{$');
    });

    it('移除 Mustache 模板 {{}}', () => {
      expect(sanitize('{{name}}')).not.toContain('{{');
    });

    it('移除反引号', () => {
      expect(sanitize('`code`')).not.toContain('`');
    });

    it('移除换行符注入', () => {
      const result = sanitize('a\nb\nc');
      expect(result.split('\n').length).toBeLessThanOrEqual(1);
      expect(result).toBe('a b c');
    });

    it('移除 CR 换行符', () => {
      expect(sanitize('a\rb\rc')).toBe('a b c');
    });

    it('移除 JS 模板字符串 ${}', () => {
      expect(sanitize('${env.SECRET}')).not.toContain('${');
    });

    it('移除 script 标签', () => {
      expect(sanitize('<script>alert(1)</script>')).not.toContain('script');
    });

    it('移除 javascript 伪协议', () => {
      expect(sanitize('javascript:void(0)')).not.toContain('javascript:');
    });

    it('移除事件处理器注入', () => {
      expect(sanitize('onclick=alert(1)')).not.toContain('onclick');
    });

    it('处理空字符串', () => {
      expect(sanitize('')).toBe('');
    });

    it('处理 null/undefined 输入', () => {
      expect(sanitize(null as any)).toBe('');
      expect(sanitize(undefined as any)).toBe('');
    });

    it('移除多余空格', () => {
      expect(sanitize('  查询    今日   交易  ')).toBe('查询 今日 交易');
    });
  });

  describe('isInjection', () => {
    it('正常输入返回 false', () => {
      expect(isInjection('查询今日交易')).toBe(false);
    });

    it('检测 {$} 模板注入', () => {
      expect(isInjection('{$user_prompt}')).toBe(true);
    });

    it('检测 {{}} Mustache 模板', () => {
      expect(isInjection('{{name}}')).toBe(true);
    });

    it('检测反引号', () => {
      expect(isInjection('`ls`')).toBe(true);
    });

    it('检测 ${} JS 模板', () => {
      expect(isInjection('${process.env.KEY}')).toBe(true);
    });

    it('检测 script 标签', () => {
      expect(isInjection('<script>alert(1)</script>')).toBe(true);
    });

    it('检测 javascript 伪协议', () => {
      expect(isInjection('javascript:alert(1)')).toBe(true);
    });

    it('检测事件处理器注入', () => {
      expect(isInjection('img onerror=alert(1)')).toBe(true);
    });

    it('null/undefined 返回 false', () => {
      expect(isInjection(null as any)).toBe(false);
      expect(isInjection(undefined as any)).toBe(false);
    });
  });
});
