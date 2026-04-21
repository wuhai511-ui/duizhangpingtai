/**
 * 钱账通（QZT）数据格式转换适配器
 * 将钱账通原始字段映射为内部格式
 */

/**
 * 将金额字符串转为整数（分），避免浮点精度问题和 BigInt 小数问题
 * 例如：100.50 -> 10050, 100 -> 10000, 0.01 -> 1
 */
function parseAmount(value: string | undefined | null): bigint {
  if (!value) return 0n;
  const num = parseFloat(value);
  if (isNaN(num)) return 0n;
  return BigInt(Math.round(num * 100));
}

export type QztFileType = 'JY' | 'JS' | 'JZ' | 'ACC' | 'SEP' | 'DW' | 'D0' | 'JY_FQ' | 'BUSINESS_ORDER';

export interface QztJyRecord {
  MERCHANT_ORDER_NO?: string;
  TRANS_DATE: string;
  TRANS_TIME: string;
  LAKALA_SERIAL: string;
  AMOUNT: string;
  FEE?: string;
  SETTLE_AMOUNT: string;
  PAY_METHOD?: string;
  CARD_NO?: string;
  BANK_NAME?: string;
  TRANS_TYPE: 'CONSUMPTION' | 'REFUND';
  TERMINAL_NO?: string;
  BRANCH_NAME?: string;
  PAY_CHANNEL?: string;
  REMARK?: string;
}

export interface QztJsRecord {
  TRANS_DATE: string;
  TRANS_TIME?: string;
  LAKALA_SERIAL: string;
  SETTLE_DATE: string;
  AMOUNT: string;
  FEE?: string;
  SETTLE_AMOUNT: string;
  SETTLE_STATUS: string;
  TERMINAL_NO?: string;
}

export interface QztJzRecord {
  SETTLE_DATE: string;
  WALLET_TYPE: string;
  AMOUNT: string;
  FEE?: string;
  SETTLE_AMOUNT: string;
}

export interface QztAccRecord {
  ACCOUNT_NO: string;
  SETTLE_DATE: string;
  AMOUNT: string;
  FEE?: string;
  SETTLE_AMOUNT: string;
}

/**
 * 将钱账通原始记录转换为内部存储格式
 * 金额字段从 元 字符串转为整数 分 的 BigInt
 */
export function qztToInternal(record: any, fileType: QztFileType): any {
  switch (fileType) {
    case 'JY':
      return {
        merchant_order_no: record.MERCHANT_ORDER_NO || record.LAKALA_SERIAL,
        trans_date: record.TRANS_DATE,
        trans_time: record.TRANS_TIME,
        terminal_no: record.TERMINAL_NO,
        branch_name: record.BRANCH_NAME,
        trans_type: record.TRANS_TYPE,
        lakala_serial: record.LAKALA_SERIAL,
        orig_lakala_serial: record.ORIG_LAKALA_SERIAL,
        card_no: record.CARD_NO,
        pay_channel: record.PAY_CHANNEL,
        bank_name: record.BANK_NAME,
        amount: parseAmount(record.AMOUNT),
        fee: parseAmount(record.FEE),
        settle_amount: parseAmount(record.SETTLE_AMOUNT),
        pay_method: record.PAY_METHOD,
        remark: record.REMARK,
      };
    case 'JS':
      return {
        trans_date: record.TRANS_DATE,
        trans_time: record.TRANS_TIME,
        terminal_no: record.TERMINAL_NO,
        lakala_serial: record.LAKALA_SERIAL,
        settle_date: record.SETTLE_DATE,
        amount: parseAmount(record.AMOUNT),
        fee: parseAmount(record.FEE),
        settle_amount: parseAmount(record.SETTLE_AMOUNT),
        settle_status: parseInt(record.SETTLE_STATUS || '0', 10),
      };
    case 'JZ':
      return {
        settle_date: record.SETTLE_DATE,
        wallet_type: record.WALLET_TYPE,
        amount: parseAmount(record.AMOUNT),
        fee: parseAmount(record.FEE),
        settle_amount: parseAmount(record.SETTLE_AMOUNT),
      };
    case 'ACC':
      return {
        account_no: record.ACCOUNT_NO,
        settle_date: record.SETTLE_DATE,
        amount: parseAmount(record.AMOUNT),
        fee: parseAmount(record.FEE),
        settle_amount: parseAmount(record.SETTLE_AMOUNT),
      };
    case 'SEP':
    case 'DW':
    case 'D0':
    case 'JY_FQ':
    case 'BUSINESS_ORDER':
      // 统一处理：转换所有金额字段
      return {
        ...record,
        amount: parseAmount(record.AMOUNT),
        fee: parseAmount(record.FEE),
        settle_amount: parseAmount(record.SETTLE_AMOUNT),
        // 针对 SEP 类型特有字段
        split_amount: parseAmount(record.SPLIT_AMOUNT),
        // 针对 DW/D0 类型特有字段
        withdraw_amount: parseAmount(record.WITHDRAW_AMOUNT),
        actual_amount: parseAmount(record.ACTUAL_AMOUNT),
      };
    default:
      return record;
  }
}

/**
 * 根据文件类型解析钱账通文件内容为记录数组
 * 钱账通文件通常以 | 分隔
 */
export function parseQztContent(content: string, fileType: QztFileType): any[] {
  if (!content || !content.trim()) return [];

  const lines = content.trim().split('\n');
  if (lines.length < 2) return [];

  // 第一行是表头
  const header = lines[0].split('|').map((h: string) => h.trim());
  const records: any[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = line.split('|');
    const record: any = {};
    header.forEach((col: string, idx: number) => {
      if (values[idx] !== undefined) {
        record[col] = values[idx].trim();
      }
    });
    records.push(record);
  }

  return records;
}
