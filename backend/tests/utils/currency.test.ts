import { describe, it, expect } from 'vitest';
import { toFen, fromFen, addFen, subFen, mulFen, divFen } from '../../src/utils/currency.js';

describe('currency utils', () => {
  describe('toFen', () => {
    it('100.00元 → 10000分', () => {
      expect(toFen('100.00')).toBe(10000);
    });

    it('整数直接返回', () => {
      expect(toFen(10000)).toBe(10000);
    });

    it('字符串整数直接返回', () => {
      expect(toFen('10000')).toBe(10000);
    });

    it('处理小数字符串', () => {
      expect(toFen('0.01')).toBe(1);
      expect(toFen('0.99')).toBe(99);
    });

    it('处理元角分完整格式', () => {
      expect(toFen('123.45')).toBe(12345);
    });

    it('空字符串/无效值返回0', () => {
      expect(toFen('')).toBe(0);
      expect(toFen('abc')).toBe(0);
    });

    it('负数转为负分', () => {
      expect(toFen('-50.00')).toBe(-5000);
    });
  });

  describe('fromFen', () => {
    it('10000分 → "100.00"', () => {
      expect(fromFen(10000)).toBe('100.00');
    });

    it('1分 → "0.01"', () => {
      expect(fromFen(1)).toBe('0.01');
    });

    it('0分 → "0.00"', () => {
      expect(fromFen(0)).toBe('0.00');
    });

    it('负数保留负号', () => {
      expect(fromFen(-5000)).toBe('-50.00');
    });

    it('不足两位补零', () => {
      expect(fromFen(5)).toBe('0.05');
      expect(fromFen(55)).toBe('0.55');
    });
  });

  describe('addFen', () => {
    it('10000 + 500 → 10500', () => {
      expect(addFen(10000, 500)).toBe(10500);
    });

    it('支持多参数', () => {
      expect(addFen(10000, 500, 300)).toBe(10800);
    });

    it('支持字符串输入', () => {
      expect(addFen('10000', '500')).toBe(10500);
    });

    it('整数加法无精度丢失', () => {
      // JavaScript 浮点：0.1 + 0.2 !== 0.3
      // 整数分：10 + 20 === 30 ✓
      expect(addFen(10, 20)).toBe(30);
    });

    it('字符串元格式加法无精度丢失', () => {
      // "0.1"元 + "0.2"元 → 10分 + 20分 = 30分
      expect(addFen('0.1', '0.2')).toBe(30);
    });
  });

  describe('subFen', () => {
    it('10000 - 500 → 9500', () => {
      expect(subFen(10000, 500)).toBe(9500);
    });

    it('支持字符串输入', () => {
      expect(subFen('10000', '500')).toBe(9500);
    });

    it('负数结果', () => {
      expect(subFen(100, 500)).toBe(-400);
    });
  });

  describe('mulFen', () => {
    it('100分 * 2 = 200分', () => {
      expect(mulFen(100, 2)).toBe(200);
    });

    it('支持小数乘法（元 * 倍数）', () => {
      // "1.00"元 * 1.5 → 150分
      expect(mulFen('1.00', 1.5)).toBe(150);
    });
  });

  describe('divFen', () => {
    it('1000 / 2 = 500', () => {
      expect(divFen(1000, 2)).toBe(500);
    });

    it('除以0返回Infinity', () => {
      expect(divFen(100, 0)).toBe(Infinity);
    });
  });
});
