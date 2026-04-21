/**
 * 货币精度工具 — 所有金额以"分"（INTEGER）为内部单位
 * 避免浮点数精度丢失（0.1 + 0.2 !== 0.3 in JS）
 */

/**
 * 任意输入转为分（INTEGER）
 * - 数字：直接返回（已是分，无小数）
 * - 字符串：判断是否含小数点 → 有则视为元×100，无则直接 parseInt
 * - 无效值：返回 0
 */
export function toFen(amount: number | string): number {
  if (typeof amount === 'number') {
    return Math.round(amount);
  }
  if (typeof amount === 'string') {
    const trimmed = amount.trim();
    if (!trimmed) return 0;
    // 含小数点 → 元格式（如 "100.50"），需转分
    // 无小数点 → 整数分格式（如 "10000"），直接 parseInt
    if (trimmed.includes('.')) {
      const parsed = parseFloat(trimmed);
      if (Number.isNaN(parsed)) return 0;
      return Math.round(parsed * 100);
    } else {
      const parsed = parseInt(trimmed, 10);
      if (Number.isNaN(parsed)) return 0;
      return parsed;
    }
  }
  return 0;
}

/**
 * 分（INTEGER）转元字符串，保留两位小数
 * 10000 → "100.00"
 * 1     → "0.01"
 * -5000 → "-50.00"
 */
export function fromFen(fen: number): string {
  if (Number.isNaN(fen)) return '0.00';
  const sign = fen < 0 ? '-' : '';
  const abs = Math.abs(fen);
  const yuan = Math.floor(abs / 100);
  const cents = abs % 100;
  return `${sign}${yuan}.${cents.toString().padStart(2, '0')}`;
}

/**
 * 安全加法（分）
 * 整数运算，无浮点精度问题
 */
export function addFen(...amounts: (number | string)[]): number {
  return amounts.reduce((acc: number, a) => acc + toFen(a), 0);
}

/**
 * 安全减法（分）
 */
export function subFen(a: number | string, b: number | string): number {
  return toFen(a) - toFen(b);
}

/**
 * 安全乘法（分 × 标量）
 * 用于按比例计算，如佣金、税费
 */
export function mulFen(amount: number | string, multiplier: number): number {
  return Math.round(toFen(amount) * multiplier);
}

/**
 * 安全除法（分 ÷ 标量）
 */
export function divFen(amount: number | string, divisor: number): number {
  return toFen(amount) / divisor;
}
