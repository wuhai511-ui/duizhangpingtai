/**
 * 通用文件解析工具
 * 支持 TXT、CSV、TSV、Excel 格式
 */
import * as xlsx from 'xlsx';

export interface ParsedData {
  headers: string[];
  rows: string[][];
}

/**
 * 根据文件内容自动识别格式并解析
 */
export function parseFileContent(content: string, filename: string): ParsedData {
  const ext = filename.toLowerCase().split('.').pop();

  if (ext === 'csv') {
    return parseCSV(content);
  }

  if (ext === 'tsv') {
    return parseTabDelimited(content);
  }

  if (ext === 'xlsx' || ext === 'xls') {
    return { headers: [], rows: [] };
  }

  return parseTextByDelimiter(content);
}

/**
 * 解析文本文件，优先按表头特征推断分隔符
 */
export function parseTextByDelimiter(content: string): ParsedData {
  const firstLine = (content || '').trim().split(/\r?\n/)[0] || '';

  if (firstLine.includes('\t')) {
    return parseTabDelimited(content);
  }

  if (firstLine.includes(',')) {
    return parseCSV(content);
  }

  return parsePipeDelimited(content);
}

/**
 * 解析管道符分隔的文本
 */
export function parsePipeDelimited(content: string): ParsedData {
  return parseDelimited(content, '|');
}

/**
 * 解析制表符分隔的文本
 */
export function parseTabDelimited(content: string): ParsedData {
  return parseDelimited(content, '\t');
}

/**
 * 解析通用分隔符文本
 */
function parseDelimited(content: string, delimiter: string): ParsedData {
  const lines = (content || '').trim().split(/\r?\n/);
  if (lines.length === 0 || !lines[0]) {
    return { headers: [], rows: [] };
  }

  const headers = splitLine(lines[0], delimiter);
  const rows: string[][] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) {
      continue;
    }
    rows.push(splitLine(line, delimiter));
  }

  return { headers, rows };
}

/**
 * 解析 CSV（逗号分隔）
 */
export function parseCSV(content: string): ParsedData {
  const lines = (content || '').trim().split(/\r?\n/);
  if (lines.length === 0 || !lines[0]) {
    return { headers: [], rows: [] };
  }

  const headers = parseCSVLine(lines[0]);
  const rows: string[][] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) {
      continue;
    }
    rows.push(parseCSVLine(line));
  }

  return { headers, rows };
}

/**
 * 解析 Excel 文件（Buffer）
 */
export function parseExcelBuffer(buffer: Buffer): ParsedData {
  const workbook = xlsx.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data = xlsx.utils.sheet_to_json<string[]>(sheet, { header: 1 });

  if (data.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = data[0].map((header) => String(header || '').trim());
  const rows = data.slice(1).map((row) => row.map((cell) => String(cell || '').trim()));

  return { headers, rows };
}

/**
 * 检查是否是 Excel 文件
 */
export function isExcelFile(filename: string): boolean {
  const ext = filename.toLowerCase().split('.').pop();
  return ext === 'xlsx' || ext === 'xls';
}

/**
 * Decode text buffer with UTF-8 first, then fallback to GB18030 for common
 * payment/billing CSV exports created on Windows.
 */
export function decodeTextBuffer(buffer: Buffer): string {
  if (!buffer || buffer.length === 0) {
    return '';
  }

  const utf8 = buffer.toString('utf-8');
  const utf8Broken = countReplacementChars(utf8);
  const utf8HasChinese = /[\u4e00-\u9fa5]/.test(utf8);

  if (utf8Broken === 0 && utf8HasChinese) {
    return stripBom(utf8);
  }

  try {
    const gb18030 = new TextDecoder('gb18030').decode(buffer);
    const gbBroken = countReplacementChars(gb18030);
    const gbHasChinese = /[\u4e00-\u9fa5]/.test(gb18030);

    if (gbHasChinese && (gbBroken < utf8Broken || !utf8HasChinese)) {
      return stripBom(gb18030);
    }
  } catch {
    // Ignore decode fallback errors and keep UTF-8 result.
  }

  return stripBom(utf8);
}

/**
 * 分割行（处理引号内的分隔符）
 */
function splitLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

/**
 * 解析 CSV 行（处理引号）
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

function countReplacementChars(text: string): number {
  if (!text) return 0;
  return (text.match(/\uFFFD/g) || []).length;
}

function stripBom(text: string): string {
  return text.replace(/^\uFEFF/, '');
}
