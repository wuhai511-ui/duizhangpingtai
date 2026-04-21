import type { ParseResult, JsSettlement } from '../types/parser.js';
import { parsePipeDelimited, parseCSV, parseExcelBuffer, isExcelFile, type ParsedData } from '../utils/file-parser.js';

export class JsParser {
  // 字段映射：表头 -> 数据库字段
  private fieldMap: Record<string, string> = {
    '商户编号': 'merchant_no',
    '交易日期': 'trans_date',
    '交易时间': 'trans_time',
    '终端号': 'terminal_no',
    '拉卡拉流水号': 'lakala_serial',
    '交易金额(分)': 'amount',
    '手续费(分)': 'fee',
    '结算金额(分)': 'settle_amount',
    '结算日期': 'settle_date',
    '结算状态': 'settle_status',
    // 兼容 CSV/Excel 中可能的列名
    '交易金额': 'amount',
    '手续费': 'fee',
    '结算金额': 'settle_amount',
  };

  /**
   * 解析文件内容（支持 TXT/CSV/Excel）
   * @param content 文件内容字符串
   * @param filename 文件名（用于判断格式）
   * @param buffer 可选的 Buffer（用于 Excel 文件）
   */
  parse(content: string, filename?: string, buffer?: Buffer): ParseResult<JsSettlement> {
    if (!content && !buffer) {
      return { success: false, records: [], error: 'Content is empty' };
    }

    let data: ParsedData;

    // 根据文件扩展名选择解析方式
    if (buffer && filename && isExcelFile(filename)) {
      data = parseExcelBuffer(buffer);
    } else {
      const ext = filename?.toLowerCase().split('.').pop();
      if (ext === 'csv') {
        data = parseCSV(content);
      } else {
        data = parsePipeDelimited(content);
      }
    }

    if (data.headers.length === 0) {
      return { success: false, records: [], error: 'Invalid header' };
    }

    // 解析数据行
    const records: JsSettlement[] = [];
    for (let i = 0; i < data.rows.length; i++) {
      try {
        const record = this.mapToRecord(data.headers, data.rows[i]);
        if (record && this.validate(record)) {
          records.push(record);
        }
      } catch (error) {
        console.warn(`Row ${i + 1} parse error:`, error);
      }
    }

    return { success: true, records };
  }

  validate(record: Partial<JsSettlement>): boolean {
    const required = ['merchant_no', 'trans_date', 'lakala_serial', 'amount', 'fee', 'settle_amount', 'settle_date', 'settle_status'];
    return required.every(field => record[field as keyof JsSettlement] !== undefined && record[field as keyof JsSettlement] !== '');
  }

  private mapToRecord(headers: string[], values: string[]): JsSettlement | null {
    const raw: Record<string, unknown> = {};

    headers.forEach((header, index) => {
      const fieldName = this.fieldMap[header];
      if (fieldName && values[index] !== undefined) {
        raw[fieldName] = values[index];
      }
    });

    // 金额字段解析（支持元和分）
    const parseAmount = (value: unknown): number => {
      if (!value) return 0;
      const str = String(value).replace(/[,，]/g, '');
      const num = parseFloat(str);
      if (isNaN(num)) return 0;
      // 如果数值看起来像元（有小数点或小于10000），转换为分
      if (str.includes('.') || num < 10000) {
        return Math.round(num * 100);
      }
      return Math.round(num);
    };

    return {
      merchant_no: String(raw.merchant_no || ''),
      trans_date: String(raw.trans_date || ''),
      trans_time: String(raw.trans_time || ''),
      terminal_no: raw.terminal_no ? String(raw.terminal_no) : undefined,
      lakala_serial: String(raw.lakala_serial || ''),
      amount: parseAmount(raw.amount),
      fee: parseAmount(raw.fee),
      settle_amount: parseAmount(raw.settle_amount),
      settle_date: String(raw.settle_date || ''),
      settle_status: parseInt(String(raw.settle_status || '0'), 10) || 0,
    };
  }
}
