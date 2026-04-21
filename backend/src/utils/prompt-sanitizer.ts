/**
 * prompt-sanitizer.ts
 * AI 对话 Prompt 注入防护工具
 *
 * 防护措施：
 * 1. 长度限制（500字符）
 * 2. 移除模板注入 {$} {{}} `
 * 3. 移除换行符注入（防止 prompt splitting）
 * 4. 注入模式检测
 */

const MAX_LENGTH = 500;
const INJECTION_PATTERNS = [
  /\{\{/,           // Mustache/Handlebars 模板 {{}}
  /\{\$/,           // Smarty/模板注入 {$
  /`/,              // 反引号（代码注入）
  /\$\{/,           // JS 模板字符串 ${}
  /<\/?script/i,    // XSS script 标签
  /javascript:/i,    // JS 伪协议
  /on\w+=/i,        // 事件处理器注入 onxxx=
];

/**
 * 对输入进行清洗，移除注入风险
 * @param input 原始用户输入
 * @returns 清洗后的安全字符串
 */
export function sanitize(input: string): string {
  if (typeof input !== 'string') return '';

  let result = input;

  // 1. 长度限制
  if (result.length > MAX_LENGTH) {
    result = result.substring(0, MAX_LENGTH);
  }

  // 2. 移除模板注入 {$} {{}}
  result = result.replace(/\{\$/g, '');
  result = result.replace(/\{\{/g, '');
  result = result.replace(/\}\}/g, '');

  // 3. 移除反引号
  result = result.replace(/`/g, '');

  // 4. 移除 JS 模板字符串 ${}
  result = result.replace(/\$\{/g, '');

  // 5. 移除换行符注入（将多行合并为单行）
  //    保留空格但压缩换行，防止 prompt splitting 攻击
  result = result.replace(/[\r\n]+/g, ' ');

  // 6. 移除 script 标签
  result = result.replace(/<script[^>]*>.*?<\/script>/gi, '');
  result = result.replace(/<[^>]+>/g, '');  // 移除所有 HTML 标签

  // 7. 移除 javascript 伪协议
  result = result.replace(/javascript:/gi, '');

  // 8. 移除事件处理器注入
  result = result.replace(/\bon\w+=/gi, '');

  // 9. 移除多余空格
  result = result.replace(/\s+/g, ' ').trim();

  return result;
}

/**
 * 检测输入是否包含注入模式
 * @param input 用户输入
 * @returns true = 检测到注入模式
 */
export function isInjection(input: string): boolean {
  if (typeof input !== 'string') return false;

  return INJECTION_PATTERNS.some(pattern => pattern.test(input));
}
