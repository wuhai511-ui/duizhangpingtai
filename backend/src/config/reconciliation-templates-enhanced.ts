/**
 * 增强版对账模板配置
 * 支持AI对话动态修改主键和辅助字段
 */

import {
  type ReconTemplate,
  type ReconKeyMatch,
  type ReconAuxField,
  type BatchType,
  DEFAULT_RECON_TEMPLATES,
} from './reconciliation-templates.js';

export * from './reconciliation-templates.js';

// 可配置字段定义
export interface ConfigurableField {
  name: string;
  displayName: string;
  description: string;
  type: 'string' | 'number' | 'date' | 'amount';
  commonNames: string[]; // 常见字段别名
}

// 业务订单常用字段
export const BUSINESS_ORDER_FIELDS: ConfigurableField[] = [
  {
    name: 'order_no',
    displayName: '订单号',
    description: '业务系统订单编号',
    type: 'string',
    commonNames: ['订单号', '子单号', 'OrderNo', 'order_id', '订单编号', '业务单号'],
  },
  {
    name: 'pay_serial_no',
    displayName: '支付流水号',
    description: '支付渠道流水号',
    type: 'string',
    commonNames: ['流水号', '支付流水号', 'SerialNo', 'transaction_id', '支付单号', '外部流水号'],
  },
  {
    name: 'order_amount',
    displayName: '订单金额',
    description: '订单金额（分）',
    type: 'amount',
    commonNames: ['金额', '订单金额', 'Amount', 'order_amount', 'PMS金额', '应收金额'],
  },
  {
    name: 'trans_date',
    displayName: '交易日期',
    description: '交易日期 YYYY-MM-DD',
    type: 'date',
    commonNames: ['日期', '交易日期', 'Date', 'trans_date', '订单日期', '入住日期'],
  },
  {
    name: 'merchant_id',
    displayName: '商户ID',
    description: '商户或门店标识',
    type: 'string',
    commonNames: ['商户号', '门店ID', 'MerchantId', 'merchant_no', '门店编号', '分店编号'],
  },
  {
    name: 'customer_phone',
    displayName: '客户手机号',
    description: '客户联系方式',
    type: 'string',
    commonNames: ['手机号', '联系电话', 'Phone', 'mobile', '客户电话'],
  },
];

// JY交易常用字段
export const JY_TRANSACTION_FIELDS: ConfigurableField[] = [
  {
    name: 'lakala_serial',
    displayName: '拉卡拉流水号',
    description: '拉卡拉系统流水号',
    type: 'string',
    commonNames: ['流水号', '拉卡拉流水', 'LakalaSerial', 'serial_no', '系统流水号'],
  },
  {
    name: 'merchant_order_no',
    displayName: '商户订单号',
    description: '商户传入的订单号',
    type: 'string',
    commonNames: ['商户订单号', '商户单号', 'MerchantOrderNo', 'order_no', '原订单号'],
  },
  {
    name: 'amount',
    displayName: '交易金额',
    description: '交易金额（分）',
    type: 'amount',
    commonNames: ['金额', '交易金额', 'Amount', 'trans_amount', '支付金额'],
  },
  {
    name: 'trans_date',
    displayName: '交易日期',
    description: '交易日期 YYYY-MM-DD',
    type: 'date',
    commonNames: ['日期', '交易日期', 'Date', 'trade_date', '清算日期'],
  },
  {
    name: 'terminal_no',
    displayName: '终端号',
    description: 'POS终端编号',
    type: 'string',
    commonNames: ['终端号', '设备号', 'TerminalNo', 'pos_no', '终端编号'],
  },
  {
    name: 'pay_channel',
    displayName: '支付渠道',
    description: '支付方式',
    type: 'string',
    commonNames: ['支付渠道', '支付方式', 'PayChannel', 'channel', '交易渠道'],
  },
];

// 智能匹配建议
export interface MatchSuggestion {
  businessField: string;
  channelField: string;
  confidence: number; // 0-100
  reason: string;
}

/**
 * 根据字段名称智能推荐匹配
 */
export function suggestFieldMatching(
  businessHeaders: string[],
  channelHeaders: string[]
): MatchSuggestion[] {
  const suggestions: MatchSuggestion[] = [];
  
  // 主键匹配建议
  const primaryKeySuggestions = suggestPrimaryKeys(businessHeaders, channelHeaders);
  suggestions.push(...primaryKeySuggestions);
  
  // 金额匹配建议
  const amountSuggestion = suggestAmountField(businessHeaders, channelHeaders);
  if (amountSuggestion) suggestions.push(amountSuggestion);
  
  // 日期匹配建议
  const dateSuggestion = suggestDateField(businessHeaders, channelHeaders);
  if (dateSuggestion) suggestions.push(dateSuggestion);
  
  return suggestions.sort((a, b) => b.confidence - a.confidence);
}

/**
 * 推荐主键匹配
 */
function suggestPrimaryKeys(
  businessHeaders: string[],
  channelHeaders: string[]
): MatchSuggestion[] {
  const suggestions: MatchSuggestion[] = [];
  
  // 1. 流水号匹配
  const businessSerial = findBestMatch(businessHeaders, ['流水号', '支付流水号', 'SerialNo', 'transaction_id', '支付单号']);
  const channelSerial = findBestMatch(channelHeaders, ['流水号', '拉卡拉流水', 'LakalaSerial', 'serial_no', '系统流水号']);
  
  if (businessSerial && channelSerial) {
    suggestions.push({
      businessField: businessSerial,
      channelField: channelSerial,
      confidence: 95,
      reason: '双方都有流水号字段，适合作为主键',
    });
  }
  
  // 2. 订单号匹配
  const businessOrder = findBestMatch(businessHeaders, ['订单号', '子单号', 'OrderNo', 'order_id', '业务单号']);
  const channelOrder = findBestMatch(channelHeaders, ['商户订单号', '商户单号', 'MerchantOrderNo', 'order_no', '原订单号']);
  
  if (businessOrder && channelOrder) {
    suggestions.push({
      businessField: businessOrder,
      channelField: channelOrder,
      confidence: 90,
      reason: '双方都有订单号字段，可作为备选主键',
    });
  }
  
  // 3. 组合匹配建议
  if (businessSerial && businessOrder && channelSerial && channelOrder) {
    suggestions.push({
      businessField: `${businessSerial}/${businessOrder}`,
      channelField: `${channelSerial}/${channelOrder}`,
      confidence: 85,
      reason: '同时匹配流水号和订单号，提高准确率',
    });
  }
  
  return suggestions;
}

/**
 * 推荐金额字段
 */
function suggestAmountField(
  businessHeaders: string[],
  channelHeaders: string[]
): MatchSuggestion | null {
  const businessAmount = findBestMatch(businessHeaders, ['金额', '订单金额', 'Amount', 'order_amount', 'PMS金额', '应收金额', '实付金额']);
  const channelAmount = findBestMatch(channelHeaders, ['金额', '交易金额', 'Amount', 'trans_amount', '支付金额']);
  
  if (businessAmount && channelAmount) {
    return {
      businessField: businessAmount,
      channelField: channelAmount,
      confidence: 98,
      reason: '金额字段是必配对账字段',
    };
  }
  
  return null;
}

/**
 * 推荐日期字段
 */
function suggestDateField(
  businessHeaders: string[],
  channelHeaders: string[]
): MatchSuggestion | null {
  const businessDate = findBestMatch(businessHeaders, ['日期', '交易日期', 'Date', 'trans_date', '订单日期', '入住日期']);
  const channelDate = findBestMatch(channelHeaders, ['日期', '交易日期', 'Date', 'trade_date', '清算日期']);
  
  if (businessDate && channelDate) {
    return {
      businessField: businessDate,
      channelField: channelDate,
      confidence: 95,
      reason: '日期字段用于精确匹配和滚动匹配',
    };
  }
  
  return null;
}

/**
 * 查找最佳匹配字段
 */
function findBestMatch(headers: string[], candidates: string[]): string | null {
  for (const candidate of candidates) {
    const match = headers.find(h => 
      h.toLowerCase().includes(candidate.toLowerCase()) ||
      candidate.toLowerCase().includes(h.toLowerCase())
    );
    if (match) return match;
  }
  return headers[0] || null;
}

/**
 * 创建动态模板
 */
export interface DynamicTemplateConfig {
  name: string;
  batchType: BatchType;
  businessFileType: 'BUSINESS_ORDER' | 'JY';
  channelFileType: 'JY' | 'JS';
  primaryKeys: {
    businessField: string;
    channelField: string;
    mode: 'exact' | 'prefix' | 'suffix' | 'contains';
    weight: number;
  }[];
  auxiliaryFields: {
    businessField: string;
    channelField: string;
    required: boolean;
  }[];
  amountFields: {
    businessField: string;
    channelField: string;
    tolerance: number;
  };
  dateFields: {
    businessField: string;
    channelField: string;
    allowEmpty: boolean;
    rollingDays: number;
  };
}

export function createDynamicTemplate(config: DynamicTemplateConfig): ReconTemplate {
  return {
    id: `dynamic_${Date.now()}`,
    name: config.name,
    batch_type: config.batchType,
    description: `动态创建的模板: ${config.name}`,
    business_source: {
      table: config.batchType === 'ORDER_VS_JY' ? 'BusinessOrder' : 'JyTransaction',
      file_type: config.businessFileType,
    },
    channel_source: {
      table: config.batchType === 'ORDER_VS_JY' ? 'JyTransaction' : 'JsSettlement',
      file_type: config.channelFileType,
    },
    primary_keys: config.primaryKeys.map(pk => ({
      mode: pk.mode,
      business_field: pk.businessField,
      channel_field: pk.channelField,
      weight: pk.weight,
    })),
    auxiliary_fields: config.auxiliaryFields.map(af => ({
      business_field: af.businessField,
      channel_field: af.channelField,
      required: af.required,
      mode: 'exact',
    })),
    amount_check: {
      business_field: config.amountFields.businessField,
      channel_field: config.amountFields.channelField,
      tolerance: config.amountFields.tolerance,
      strict: config.amountFields.tolerance === 0,
    },
    date_check: {
      business_field: config.dateFields.businessField,
      channel_field: config.dateFields.channelField,
      rolling_days: config.dateFields.rollingDays,
      allow_empty_date: config.dateFields.allowEmpty,
    },
  };
}

/**
 * AI对话解析 - 从自然语言提取模板配置
 */
export function parseTemplateFromConversation(message: string): Partial<DynamicTemplateConfig> {
  const config: Partial<DynamicTemplateConfig> = {};
  
  // 解析主键配置
  const primaryKeyMatch = message.match(/主键[:：]\s*(.+)/i);
  if (primaryKeyMatch) {
    const keys = primaryKeyMatch[1].split(/[,，、/]/).map(k => k.trim());
    config.primaryKeys = keys.map((key, index) => ({
      businessField: key,
      channelField: key,
      mode: 'exact' as const,
      weight: 100 - index * 10,
    }));
  }
  
  // 解析辅助字段
  const auxMatch = message.match(/辅助字段[:：]\s*(.+)/i);
  if (auxMatch) {
    const fields = auxMatch[1].split(/[,，、/]/).map(f => f.trim());
    config.auxiliaryFields = fields.map(field => ({
      businessField: field,
      channelField: field,
      required: false,
    }));
  }
  
  // 解析金额容差
  const toleranceMatch = message.match(/容差[:：]\s*(\d+)/i);
  if (toleranceMatch && config.amountFields) {
    config.amountFields.tolerance = parseInt(toleranceMatch[1]);
  }
  
  // 解析滚动天数
  const rollingMatch = message.match(/滚动[:：]\s*(\d+)/i);
  if (rollingMatch && config.dateFields) {
    config.dateFields.rollingDays = parseInt(rollingMatch[1]);
  }
  
  return config;
}

/**
 * 获取可用的模板列表（包含动态模板）
 */
export function getAvailableTemplates(): ReconTemplate[] {
  return [
    ...Object.values(DEFAULT_RECON_TEMPLATES),
  ];
}
