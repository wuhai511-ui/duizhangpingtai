import type { ParseResult } from '../types/parser.js';

export abstract class BaseParser<T> {
  protected fieldMap: Record<string, string> = {};

  abstract parse(content: string): ParseResult<T>;
  abstract validate(record: Partial<T>): boolean;

  protected parseLine(line: string): string[] {
    return line.split('|').map(field => field.trim());
  }

  protected mapToRecord(headers: string[], values: string[]): Record<string, unknown> {
    const record: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      const fieldName = this.fieldMap[header];
      if (fieldName && values[index] !== undefined) {
        record[fieldName] = values[index];
      }
    });
    return record;
  }

  protected parseNumber(value: string): number {
    return parseInt(value, 10) || 0;
  }

  protected parseAmount(value: string): number {
    // 金额字段，支持元转分
    const num = parseFloat(value) || 0;
    return Math.round(num * 100);
  }
}
