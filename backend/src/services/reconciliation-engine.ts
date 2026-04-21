export enum ResultType {
  MATCH = 'MATCH',
  ROLLING = 'ROLLING',
  LONG = 'LONG',
  SHORT = 'SHORT',
  AMOUNT_MISMATCH = 'AMOUNT_MISMATCH',
}

export interface ReconStats {
  total: number;
  match: number;
  rolling: number;
  long: number;
  short: number;
  amount_diff: number;
}

export interface ReconDetail {
  serial_no: string;
  result_type: ResultType;
  business_amount?: bigint;
  channel_amount?: bigint;
  diff_amount?: bigint;
  business_data?: string;
  channel_data?: string;
  match_date?: string;
}

export interface ReconResult {
  stats: ReconStats;
  details: ReconDetail[];
}

function safeJsonStringify(value: unknown): string {
  return JSON.stringify(value, (_key: string, v: unknown) => (typeof v === 'bigint' ? v.toString() : v));
}

export interface ReconOptions {
  rollingDays?: number;
}

export class ReconciliationEngine {
  /**
   * 执行双方数据对账
   * @param businessData 业务方数据（BusinessOrder 或 JyTransaction）
   * @param channelData 渠道方数据（JyTransaction 或 JsSettlement）
   * @param batchType 对账类型：ORDER_VS_JY 或 JY_VS_JS
   * @param options 对账选项
   */
  reconcile(
    businessData: any[],
    channelData: any[],
    batchType: 'ORDER_VS_JY' | 'JY_VS_JS',
    options: ReconOptions = {}
  ): ReconResult {
    const rollingDays = options.rollingDays ?? 3;
    const stats: ReconStats = {
      total: 0,
      match: 0,
      rolling: 0,
      long: 0,
      short: 0,
      amount_diff: 0,
    };
    const details: ReconDetail[] = [];

    // 获取流水号字段名
    const businessSerialField = batchType === 'ORDER_VS_JY' ? 'pay_serial_no' : 'lakala_serial';
    const channelSerialField = 'lakala_serial';
    const businessAmountField = batchType === 'ORDER_VS_JY' ? 'order_amount' : 'amount';
    const channelAmountField = 'amount';

    // 建立索引
    const businessMap = new Map<string, any>();
    const businessByDate = new Map<string, Map<string, any>>();

    for (const item of businessData) {
      const serial = String(item[businessSerialField] || '').trim();
      if (!serial) continue;

      businessMap.set(serial, item);

      const date = item.trans_date || '';
      if (!businessByDate.has(date)) {
        businessByDate.set(date, new Map());
      }
      businessByDate.get(date)!.set(serial, item);
    }

    const channelMap = new Map<string, any>();
    const channelByDate = new Map<string, Map<string, any>>();

    for (const item of channelData) {
      const serial = String(item[channelSerialField] || '').trim();
      if (!serial) continue;

      channelMap.set(serial, item);

      const date = item.trans_date || '';
      if (!channelByDate.has(date)) {
        channelByDate.set(date, new Map());
      }
      channelByDate.get(date)!.set(serial, item);
    }

    // 已匹配的记录
    const matchedBusiness = new Set<string>();
    const matchedChannel = new Set<string>();

    // 第一轮：精确匹配（同日期）
    for (const [serial, businessItem] of businessMap) {
      const channelItem = channelMap.get(serial);
      if (!channelItem) continue;

      const businessAmount = BigInt(businessItem[businessAmountField] || 0);
      const channelAmount = BigInt(channelItem[channelAmountField] || 0);

      if (businessItem.trans_date === channelItem.trans_date) {
        matchedBusiness.add(serial);
        matchedChannel.add(serial);
        stats.total++;

        if (businessAmount === channelAmount) {
          stats.match++;
          details.push({
            serial_no: serial,
            result_type: ResultType.MATCH,
            business_amount: businessAmount,
            channel_amount: channelAmount,
            business_data: safeJsonStringify(businessItem),
            channel_data: safeJsonStringify(channelItem),
          });
        } else {
          stats.amount_diff++;
          details.push({
            serial_no: serial,
            result_type: ResultType.AMOUNT_MISMATCH,
            business_amount: businessAmount,
            channel_amount: channelAmount,
            diff_amount: businessAmount - channelAmount,
            business_data: safeJsonStringify(businessItem),
            channel_data: safeJsonStringify(channelItem),
          });
        }
      }
    }

    // 第二轮：滚动匹配（跨日期）
    for (const [serial, businessItem] of businessMap) {
      if (matchedBusiness.has(serial)) continue;

      const channelItem = channelMap.get(serial);
      if (!channelItem) continue;

      const businessDate = new Date(businessItem.trans_date);
      const channelDate = new Date(channelItem.trans_date);
      const daysDiff = Math.abs((channelDate.getTime() - businessDate.getTime()) / (1000 * 60 * 60 * 24));

      if (daysDiff <= rollingDays && daysDiff > 0) {
        matchedBusiness.add(serial);
        matchedChannel.add(serial);
        stats.total++;

        const businessAmount = BigInt(businessItem[businessAmountField] || 0);
        const channelAmount = BigInt(channelItem[channelAmountField] || 0);

        if (businessAmount === channelAmount) {
          stats.rolling++;
          details.push({
            serial_no: serial,
            result_type: ResultType.ROLLING,
            business_amount: businessAmount,
            channel_amount: channelAmount,
            match_date: channelItem.trans_date,
            business_data: safeJsonStringify(businessItem),
            channel_data: safeJsonStringify(channelItem),
          });
        } else {
          stats.amount_diff++;
          details.push({
            serial_no: serial,
            result_type: ResultType.AMOUNT_MISMATCH,
            business_amount: businessAmount,
            channel_amount: channelAmount,
            diff_amount: businessAmount - channelAmount,
            match_date: channelItem.trans_date,
            business_data: safeJsonStringify(businessItem),
            channel_data: safeJsonStringify(channelItem),
          });
        }
      }
    }

    // 剩余未匹配：长款（业务方有，渠道方无）
    for (const [serial, businessItem] of businessMap) {
      if (matchedBusiness.has(serial)) continue;

      stats.total++;
      stats.long++;
      const businessAmount = BigInt(businessItem[businessAmountField] || 0);
      details.push({
        serial_no: serial,
        result_type: ResultType.LONG,
        business_amount: businessAmount,
        business_data: safeJsonStringify(businessItem),
      });
    }

    // 剩余未匹配：短款（渠道方有，业务方无）
    for (const [serial, channelItem] of channelMap) {
      if (matchedChannel.has(serial)) continue;

      stats.total++;
      stats.short++;
      const channelAmount = BigInt(channelItem[channelAmountField] || 0);
      details.push({
        serial_no: serial,
        result_type: ResultType.SHORT,
        channel_amount: channelAmount,
        channel_data: safeJsonStringify(channelItem),
      });
    }

    return { stats, details };
  }
}