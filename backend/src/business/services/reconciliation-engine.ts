import {
  type ReconTemplate,
  type ReconKeyMatch,
  type ReconAuxField,
  type ReconFieldMapping,
  DEFAULT_RECON_TEMPLATES,
} from '../../config/reconciliation-templates.js';

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
  match_key?: string;         // 匹配使用的主键
  match_mode?: string;        // 匹配方式
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
  templateId?: string;
  template?: ReconTemplate;
}

export class ReconciliationEngine {
  private normalizeTolerance(value: unknown): bigint {
    if (value === null || value === undefined || value === '') return 0n;
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric)) return 0n;
    return BigInt(Math.max(0, Math.round(numeric)));
  }

  private applyFieldTransform(
    value: unknown,
    transform: ReconFieldMapping['transform'] = 'identity',
  ): unknown {
    switch (transform) {
      case 'trim':
        return String(value ?? '').trim();
      case 'upper':
        return String(value ?? '').toUpperCase();
      case 'lower':
        return String(value ?? '').toLowerCase();
      case 'yuan_to_fen':
        return this.normalizeAmount(value, 'yuan_to_fen').toString();
      case 'fen_identity':
        return this.normalizeAmount(value, 'fen_identity').toString();
      case 'identity':
      default:
        return value;
    }
  }

  private applyFieldMappings(data: any[], mappings?: ReconFieldMapping[]): any[] {
    if (!Array.isArray(mappings) || mappings.length === 0) return data;
    return data.map((item) => {
      const next = { ...item };
      for (const mapRule of mappings) {
        if (!mapRule?.source_field || !mapRule?.target_field) continue;
        const sourceValue = this.getFieldValue(item, mapRule.source_field);
        if (sourceValue === undefined || sourceValue === null || sourceValue === '') continue;
        next[mapRule.target_field] = this.applyFieldTransform(sourceValue, mapRule.transform);
      }
      return next;
    });
  }

  private normalizeAmount(
    value: unknown,
    transform: 'auto' | 'fen_identity' | 'yuan_to_fen' = 'auto',
  ): bigint {
    const rawText = String(value ?? '').trim().replace(/[`',，\s]/g, '');
    if (!rawText) return 0n;

    const toFen = (text: string): bigint => {
      const negative = text.startsWith('-');
      const unsigned = negative ? text.slice(1) : text;
      const [intPartRaw, fracRaw = ''] = unsigned.split('.');
      const intPart = intPartRaw.replace(/\D/g, '') || '0';
      const fracPart = fracRaw.replace(/\D/g, '').slice(0, 2).padEnd(2, '0');
      const fen = BigInt(intPart) * 100n + BigInt(fracPart || '0');
      return negative ? -fen : fen;
    };

    if (transform === 'yuan_to_fen') {
      return toFen(rawText);
    }
    if (transform === 'fen_identity') {
      const intText = rawText.includes('.') ? rawText.split('.')[0] : rawText;
      const normalized = intText === '' || intText === '-' ? '0' : intText;
      return BigInt(normalized);
    }

    if (rawText.includes('.')) {
      return toFen(rawText);
    }
    return BigInt(rawText);
  }

  /**
   * 执行双方数据对账（旧接口兼容）
   */
  reconcile(
    businessData: any[],
    channelData: any[],
    batchType: 'ORDER_VS_JY' | 'JY_VS_JS',
    options: ReconOptions = {}
  ): ReconResult {
    // 如果有模板配置，使用模板驱动匹配
    const template = options.template || (options.templateId ? DEFAULT_RECON_TEMPLATES[options.templateId] : null);
    if (template) {
      return this.reconcileWithTemplate(businessData, channelData, template);
    }

    // 兼容旧逻辑（已修复日期空值问题）
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

    // 第一轮：精确匹配（同日期或日期为空时匹配）
    for (const [serial, businessItem] of businessMap) {
      const channelItem = channelMap.get(serial);
      if (!channelItem) continue;

      const businessAmount = BigInt(businessItem[businessAmountField] || 0);
      const channelAmount = BigInt(channelItem[channelAmountField] || 0);

      const businessDate = (businessItem.trans_date || '').trim();
      const channelDate = (channelItem.trans_date || '').trim();
      // 日期为空时跳过日期匹配，直接匹配
      const dateMatch = !businessDate || !channelDate || businessDate === channelDate;

      if (dateMatch) {
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
            match_key: businessSerialField,
            match_mode: 'exact',
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
            match_key: businessSerialField,
            match_mode: 'exact',
          });
        }
      }
    }

    // 第二轮：滚动匹配（跨日期，日期都不为空时才进行）
    for (const [serial, businessItem] of businessMap) {
      if (matchedBusiness.has(serial)) continue;

      const channelItem = channelMap.get(serial);
      if (!channelItem) continue;

      const businessDate = (businessItem.trans_date || '').trim();
      const channelDate = (channelItem.trans_date || '').trim();
      
      // 任意一方日期为空时，不进行滚动匹配（已由精确匹配处理）
      if (!businessDate || !channelDate) continue;

      const bDate = new Date(businessDate.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'));
      const cDate = new Date(channelDate.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'));
      const daysDiff = Math.abs((cDate.getTime() - bDate.getTime()) / (1000 * 60 * 60 * 24));

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
            match_key: businessSerialField,
            match_mode: 'rolling',
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
            match_key: businessSerialField,
            match_mode: 'rolling',
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

  /**
   * 基于模板配置的对账（支持灵活主键和辅助字段）
   */
  reconcileWithTemplate(
    businessData: any[],
    channelData: any[],
    template: ReconTemplate
  ): ReconResult {
    const normalizedBusinessData = this.applyFieldMappings(
      businessData,
      template.field_mappings?.business,
    );
    const normalizedChannelData = this.applyFieldMappings(
      channelData,
      template.field_mappings?.channel,
    );

    const stats: ReconStats = {
      total: 0,
      match: 0,
      rolling: 0,
      long: 0,
      short: 0,
      amount_diff: 0,
    };
    const details: ReconDetail[] = [];

    const matchedBusiness = new Set<number>();
    const matchedChannel = new Set<number>();

    // 为渠道方建立多字段索引
    const channelIndexes = this.buildChannelIndexes(normalizedChannelData, template);

    // 第一轮：按模板主键逐级匹配
    // 按权重排序主键
    const sortedKeys = [...template.primary_keys].sort((a, b) => b.weight - a.weight);

    for (let bi = 0; bi < normalizedBusinessData.length; bi++) {
      if (matchedBusiness.has(bi)) continue;
      const businessItem = normalizedBusinessData[bi];

      for (const keyMatch of sortedKeys) {
        const rawValue = this.getFieldValue(businessItem, keyMatch.business_field);
        if (!rawValue) continue;
        const businessValue = String(rawValue);

        // 根据匹配模式在渠道方索引中查找
          const channelCandidates = this.findChannelCandidates(
          businessValue, keyMatch, channelIndexes, normalizedChannelData
        );

        for (const ci of channelCandidates) {
          if (matchedChannel.has(ci)) continue;
          const channelItem = normalizedChannelData[ci];

          // 校验辅助字段
          if (!this.checkAuxiliaryFields(businessItem, channelItem, template.auxiliary_fields)) {
            continue;
          }

          // 校验金额
          const businessAmount = this.normalizeAmount(
            this.getFieldValue(businessItem, template.amount_check.business_field),
            template.amount_check.business_transform ?? 'auto',
          );
          const channelAmount = this.normalizeAmount(
            this.getFieldValue(channelItem, template.amount_check.channel_field),
            template.amount_check.channel_transform ?? 'auto',
          );
          const tolerance = this.normalizeTolerance(template.amount_check.tolerance);

          // 校验日期
          const businessDate = String(this.getFieldValue(businessItem, template.date_check.business_field) || '').trim();
          const channelDate = String(this.getFieldValue(channelItem, template.date_check.channel_field) || '').trim();
          const allowEmptyDate = template.date_check.allow_empty_date ?? true;

          let dateResult: 'exact' | 'rolling' | 'none';
          if (!businessDate || !channelDate) {
            dateResult = allowEmptyDate ? 'exact' : 'none';
          } else if (businessDate === channelDate) {
            dateResult = 'exact';
          } else {
            const rollingDays = template.date_check.rolling_days ?? 3;
            const bDate = new Date(businessDate.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'));
            const cDate = new Date(channelDate.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'));
            const daysDiff = Math.abs((cDate.getTime() - bDate.getTime()) / (1000 * 60 * 60 * 24));
            dateResult = daysDiff <= rollingDays ? 'rolling' : 'none';
          }

          if (dateResult === 'none') continue;

          matchedBusiness.add(bi);
          matchedChannel.add(ci);
          stats.total++;

          const serialNo = String(businessValue);
          const amountDiff = businessAmount - channelAmount;
          const isAmountMatch = template.amount_check.strict
            ? amountDiff === 0n
            : (amountDiff <= 0n ? -amountDiff : amountDiff) <= tolerance;

          if (isAmountMatch) {
            if (dateResult === 'rolling') {
              stats.rolling++;
              details.push({
                serial_no: serialNo,
                result_type: ResultType.ROLLING,
                business_amount: businessAmount,
                channel_amount: channelAmount,
                match_date: channelDate,
                business_data: safeJsonStringify(businessItem),
                channel_data: safeJsonStringify(channelItem),
                match_key: `${keyMatch.business_field}=${keyMatch.channel_field}`,
                match_mode: `template:${keyMatch.mode}`,
              });
            } else {
              stats.match++;
              details.push({
                serial_no: serialNo,
                result_type: ResultType.MATCH,
                business_amount: businessAmount,
                channel_amount: channelAmount,
                business_data: safeJsonStringify(businessItem),
                channel_data: safeJsonStringify(channelItem),
                match_key: `${keyMatch.business_field}=${keyMatch.channel_field}`,
                match_mode: `template:${keyMatch.mode}`,
              });
            }
          } else {
            stats.amount_diff++;
            details.push({
              serial_no: serialNo,
              result_type: ResultType.AMOUNT_MISMATCH,
              business_amount: businessAmount,
              channel_amount: channelAmount,
              diff_amount: amountDiff,
              match_date: dateResult === 'rolling' ? channelDate : undefined,
              business_data: safeJsonStringify(businessItem),
              channel_data: safeJsonStringify(channelItem),
              match_key: `${keyMatch.business_field}=${keyMatch.channel_field}`,
              match_mode: `template:${keyMatch.mode}`,
            });
          }
          break; // 匹配到一个就跳出
        }

        if (matchedBusiness.has(bi)) break;
      }
    }

    // 剩余未匹配：长款
    for (let bi = 0; bi < normalizedBusinessData.length; bi++) {
      if (matchedBusiness.has(bi)) continue;
      const businessItem = normalizedBusinessData[bi];
      stats.total++;
      stats.long++;
      const businessAmount = this.normalizeAmount(
        this.getFieldValue(businessItem, template.amount_check.business_field),
        template.amount_check.business_transform ?? 'auto',
      );
      details.push({
        serial_no: String(this.getFieldValue(businessItem, template.primary_keys[0]?.business_field) || `BO_${bi}`),
        result_type: ResultType.LONG,
        business_amount: businessAmount,
        business_data: safeJsonStringify(businessItem),
      });
    }

    // 剩余未匹配：短款
    for (let ci = 0; ci < normalizedChannelData.length; ci++) {
      if (matchedChannel.has(ci)) continue;
      const channelItem = normalizedChannelData[ci];
      stats.total++;
      stats.short++;
      const channelAmount = this.normalizeAmount(
        this.getFieldValue(channelItem, template.amount_check.channel_field),
        template.amount_check.channel_transform ?? 'auto',
      );
      details.push({
        serial_no: String(this.getFieldValue(channelItem, template.primary_keys[0]?.channel_field) || `CH_${ci}`),
        result_type: ResultType.SHORT,
        channel_amount: channelAmount,
        channel_data: safeJsonStringify(channelItem),
      });
    }

    return { stats, details };
  }

  /**
   * 为渠道方建立多字段索引
   */
  private buildChannelIndexes(channelData: any[], template: ReconTemplate): Map<string, Map<string, number[]>> {
    // fieldName -> value -> [indices]
    const indexes = new Map<string, Map<string, number[]>>();

    for (const keyMatch of template.primary_keys) {
      const fieldIndex = new Map<string, number[]>();
      for (let i = 0; i < channelData.length; i++) {
        const value = String(this.getFieldValue(channelData[i], keyMatch.channel_field) || '').trim();
        if (!value) continue;
        if (!fieldIndex.has(value)) {
          fieldIndex.set(value, []);
        }
        fieldIndex.get(value)!.push(i);
      }
      indexes.set(keyMatch.channel_field, fieldIndex);
    }

    return indexes;
  }

  /**
   * 根据匹配模式查找渠道方候选记录
   */
  private findChannelCandidates(
    businessValue: string,
    keyMatch: ReconKeyMatch,
    channelIndexes: Map<string, Map<string, number[]>>,
    channelData: any[]
  ): number[] {
    const fieldIndex = channelIndexes.get(keyMatch.channel_field);
    if (!fieldIndex) return [];

    switch (keyMatch.mode) {
      case 'exact':
        return fieldIndex.get(businessValue) || [];

      case 'prefix': {
        const len = keyMatch.length || 8;
        const prefix = businessValue.substring(0, len);
        const candidates: number[] = [];
        for (const [value, indices] of fieldIndex) {
          if (value.startsWith(prefix) || prefix.startsWith(value)) {
            candidates.push(...indices);
          }
        }
        return candidates;
      }

      case 'suffix': {
        const len = keyMatch.length || 8;
        const suffix = businessValue.slice(-len);
        const candidates: number[] = [];
        for (const [value, indices] of fieldIndex) {
          if (value.endsWith(suffix) || suffix.endsWith(value)) {
            candidates.push(...indices);
          }
        }
        return candidates;
      }

      case 'contains': {
        const candidates: number[] = [];
        for (const [value, indices] of fieldIndex) {
          if (value.includes(businessValue) || businessValue.includes(value)) {
            candidates.push(...indices);
          }
        }
        return candidates;
      }

      case 'regex': {
        if (!keyMatch.pattern) return [];
        try {
          const regex = new RegExp(keyMatch.pattern);
          const candidates: number[] = [];
          for (const [value, indices] of fieldIndex) {
            if (regex.test(value)) {
              candidates.push(...indices);
            }
          }
          return candidates;
        } catch {
          return [];
        }
      }

      default:
        return fieldIndex.get(businessValue) || [];
    }
  }

  /**
   * 校验辅助字段
   */
  private checkAuxiliaryFields(
    businessItem: any,
    channelItem: any,
    auxFields: ReconAuxField[]
  ): boolean {
    for (const aux of auxFields) {
      const bVal = String(this.getFieldValue(businessItem, aux.business_field) || '').trim();
      const cVal = String(this.getFieldValue(channelItem, aux.channel_field) || '').trim();

      // 两者都为空时跳过
      if (!bVal && !cVal) continue;

      // 必须匹配的字段
      if (aux.required) {
        if (aux.mode === 'exact' && bVal !== cVal) return false;
        if (aux.mode === 'contains' && !bVal.includes(cVal) && !cVal.includes(bVal)) return false;
      }
    }
    return true;
  }

  /**
   * 获取对象字段值（支持嵌套和别名）
   */
  private getFieldValue(obj: any, field: string): unknown {
    if (!obj) return undefined;
    if (field in obj) return obj[field];
    // 尝试驼峰转下划线
    const snakeCase = field.replace(/[A-Z]/g, m => `_${m.toLowerCase()}`);
    if (snakeCase in obj) return obj[snakeCase];
    return undefined;
  }
}
