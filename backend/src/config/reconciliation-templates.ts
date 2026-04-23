/**
 * 对账模板配置
 * 支持灵活配置对账主键、辅助字段、匹配规则
 */

export type BatchType = 'ORDER_VS_JY' | 'JY_VS_JS';

export interface ReconTemplate {
  id: string;
  name: string;
  batch_type: BatchType;
  description?: string;
  
  // 业务方数据源
  business_source: {
    table: 'BusinessOrder' | 'JyTransaction';
    file_type: 'BUSINESS_ORDER' | 'JY';
  };
  
  // 渠道方数据源
  channel_source: {
    table: 'JyTransaction' | 'JsSettlement';
    file_type: 'JY' | 'JS';
  };
  
  // 主键匹配配置
  primary_keys: ReconKeyMatch[];
  
  // 辅助字段匹配配置
  auxiliary_fields: ReconAuxField[];
  
  // 金额校验配置
  amount_check: {
    business_field: string;     // 业务方金额字段
    channel_field: string;      // 渠道方金额字段
    tolerance?: number;         // 允许误差（分）
    strict?: boolean;           // 是否严格相等
  };
  
  // 日期校验配置
  date_check: {
    business_field: string;     // 业务方日期字段
    channel_field: string;      // 渠道方日期字段
    rolling_days?: number;      // 滚动匹配天数
    allow_empty_date?: boolean; // 允许日期为空时直接匹配
  };
  
  // 其他校验规则
  additional_rules?: ReconRule[];
}

export interface ReconKeyMatch {
  // 主键匹配方式
  mode: 'exact' | 'prefix' | 'suffix' | 'regex' | 'fuzzy' | 'contains';
  
  // 业务方字段
  business_field: string;
  
  // 渠道方字段  
  channel_field: string;
  
  // 权重（用于多主键时判断匹配优先级）
  weight: number;
  
  // 正则表达式（mode=regex时）
  pattern?: string;
  
  // 前缀/后缀长度（mode=prefix/suffix时）
  length?: number;
}

export interface ReconAuxField {
  // 辅助字段匹配
  business_field: string;
  channel_field: string;
  
  // 是否必须匹配
  required: boolean;
  
  // 匹配方式
  mode: 'exact' | 'contains' | 'range';
  
  // 范围配置（mode=range时）
  range?: {
    min?: number;
    max?: number;
  };
}

export interface ReconRule {
  name: string;
  description?: string;
  
  // 规则类型
  type: 'filter' | 'transform' | 'validate';
  
  // 应用字段
  target_field: string;
  
  // 规则配置
  config: Record<string, unknown>;
}

// 预设模板
export const DEFAULT_RECON_TEMPLATES: Record<string, ReconTemplate> = {
  'hotel_order_vs_jy': {
    id: 'hotel_order_vs_jy',
    name: '酒店订单 vs 拉卡拉流水',
    batch_type: 'ORDER_VS_JY',
    description: '酒店业务订单与拉卡拉交易流水对账',
    
    business_source: {
      table: 'BusinessOrder',
      file_type: 'BUSINESS_ORDER',
    },
    
    channel_source: {
      table: 'JyTransaction',
      file_type: 'JY',
    },
    
    primary_keys: [
      {
        mode: 'exact',
        business_field: 'pay_serial_no',
        channel_field: 'lakala_serial',
        weight: 100,
      },
    ],
    
    auxiliary_fields: [
      {
        business_field: 'order_no',
        channel_field: 'merchant_order_no',
        required: false,
        mode: 'exact',
      },
    ],
    
    amount_check: {
      business_field: 'order_amount',
      channel_field: 'amount',
      tolerance: 0,
      strict: true,
    },
    
    date_check: {
      business_field: 'trans_date',
      channel_field: 'trans_date',
      rolling_days: 3,
      allow_empty_date: true, // 业务订单日期为空时允许匹配
    },
  },
  
  'jy_vs_js': {
    id: 'jy_vs_js',
    name: '拉卡拉流水 vs 结算明细',
    batch_type: 'JY_VS_JS',
    description: '拉卡拉交易流水与结算明细对账',
    
    business_source: {
      table: 'JyTransaction',
      file_type: 'JY',
    },
    
    channel_source: {
      table: 'JsSettlement',
      file_type: 'JS',
    },
    
    primary_keys: [
      {
        mode: 'exact',
        business_field: 'lakala_serial',
        channel_field: 'lakala_serial',
        weight: 100,
      },
    ],
    
    auxiliary_fields: [],
    
    amount_check: {
      business_field: 'settle_amount',
      channel_field: 'settle_amount',
      tolerance: 0,
      strict: true,
    },
    
    date_check: {
      business_field: 'trans_date',
      channel_field: 'settle_date',
      rolling_days: 7,
      allow_empty_date: false,
    },
  },
  
  'order_by_merchant_order': {
    id: 'order_by_merchant_order',
    name: '订单 vs 流水（商户订单号匹配）',
    batch_type: 'ORDER_VS_JY',
    description: '使用商户订单号进行匹配',
    
    business_source: {
      table: 'BusinessOrder',
      file_type: 'BUSINESS_ORDER',
    },
    
    channel_source: {
      table: 'JyTransaction',
      file_type: 'JY',
    },
    
    primary_keys: [
      {
        mode: 'exact',
        business_field: 'order_no',
        channel_field: 'merchant_order_no',
        weight: 100,
      },
    ],
    
    auxiliary_fields: [
      {
        business_field: 'pay_serial_no',
        channel_field: 'lakala_serial',
        required: false,
        mode: 'exact',
      },
    ],
    
    amount_check: {
      business_field: 'order_amount',
      channel_field: 'amount',
      tolerance: 100, // 允许1元误差
      strict: false,
    },
    
    date_check: {
      business_field: 'trans_date',
      channel_field: 'trans_date',
      rolling_days: 5,
      allow_empty_date: true,
    },
  },
};

/**
 * 获取对账模板
 */
export function getReconTemplate(templateId: string): ReconTemplate | null {
  return DEFAULT_RECON_TEMPLATES[templateId] || null;
}

/**
 * 获取所有对账模板
 */
export function getAllReconTemplates(): ReconTemplate[] {
  return Object.values(DEFAULT_RECON_TEMPLATES);
}

/**
 * 根据批次类型获取模板
 */
export function getTemplatesByBatchType(batchType: BatchType): ReconTemplate[] {
  return Object.values(DEFAULT_RECON_TEMPLATES).filter(t => t.batch_type === batchType);
}

/**
 * 获取批次类型默认模板
 * ORDER_VS_JY 默认按订单号匹配（业务 order_no -> 渠道 merchant_order_no）
 */
export function getDefaultTemplateByBatchType(batchType: BatchType): ReconTemplate | null {
  if (batchType === 'ORDER_VS_JY') {
    return DEFAULT_RECON_TEMPLATES.order_by_merchant_order || null;
  }
  if (batchType === 'JY_VS_JS') {
    return DEFAULT_RECON_TEMPLATES.jy_vs_js || null;
  }
  return null;
}
