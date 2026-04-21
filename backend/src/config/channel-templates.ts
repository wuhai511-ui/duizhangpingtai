/**
 * 渠道模板配置
 * 独立管理各渠道账单的识别规则和字段映射
 */

export type ChannelKind = 'wechat' | 'alipay' | 'lakala' | 'meituan' | 'douyin' | 'bank' | 'other';

export interface ChannelTemplate {
  kind: ChannelKind;
  label: string;
  label_en: string;
  file_type: 'JY' | 'JS' | 'BUSINESS_ORDER' | 'INVOICE';
  description: string;
  
  // 识别规则
  identification: {
    filename_patterns: RegExp[];
    header_keywords: string[];      // 必须匹配的关键词
    header_exclusive?: string[];    // 排他性关键词（有则不是该渠道）
    min_match_count: number;        // 最少匹配关键词数
  };
  
  // 字段映射（标准字段名 -> 渠道别名列表）
  field_mapping: Record<string, string[]>;
  
  // 特殊处理规则
  special_rules?: {
    amount_unit?: 'fen' | 'yuan';   // 金额单位
    date_format?: string;           // 日期格式
    time_extract_from?: string;     // 从哪个字段提取时间
    clean_chars?: string[];         // 需要清洗的字符
  };
}

export const CHANNEL_TEMPLATES: Record<ChannelKind, ChannelTemplate> = {
  wechat: {
    kind: 'wechat',
    label: '微信账单',
    label_en: 'WeChat Bill',
    file_type: 'JY',
    description: '微信支付交易账单',
    
    identification: {
      filename_patterns: [/微信/i, /wechat/i, /wx.*bill/i],
      header_keywords: [
        '公众账号ID', '微信订单号', '微信支付订单号', '商户号(微信)',
        '付款银行', '应结订单金额', '费率备注', '微信退款单号',
        '商户退款单号', '商品名称',
      ],
      header_exclusive: ['支付宝交易号', 'alipay'],
      min_match_count: 2,
    },
    
    field_mapping: {
      merchant_no: ['商户号', '商户编号', '公众账号ID'],
      trans_date: ['交易日期', '日期', '交易时间'],
      trans_time: ['交易时间', '时间'],
      lakala_serial: ['微信订单号', '微信支付订单号', '交易流水号'],
      orig_lakala_serial: ['微信退款单号', '原微信订单号'],
      pay_channel: ['公众账号ID', '支付渠道', '渠道来源'],
      bank_name: ['付款银行', '银行名称'],
      amount: ['订单金额', '交易金额', '订单金额(分)'],
      fee: ['手续费', '费率备注', '服务费'],
      settle_amount: ['应结订单金额', '结算金额', '实收金额'],
      merchant_order_no: ['商户订单号', '商家订单号'],
      pay_order_no: ['商户退款单号', '退款订单号'],
      remark: ['商品名称', '备注', '费率备注'],
    },
    
    special_rules: {
      amount_unit: 'fen',
      time_extract_from: '交易时间',
      clean_chars: ['`'],
    },
  },
  
  alipay: {
    kind: 'alipay',
    label: '支付宝账单',
    label_en: 'Alipay Bill',
    file_type: 'JY',
    description: '支付宝交易账单',
    
    identification: {
      filename_patterns: [/支付宝/i, /alipay/i, /ali.*bill/i],
      header_keywords: [
        '支付宝交易号', '商家订单号', '业务时间', '支付宝账号',
        '订单金额（元）', '服务费（元）', '实收金额', '退款金额',
        '交易来源', '资金操作',
      ],
      header_exclusive: ['公众账号ID', '微信订单号'],
      min_match_count: 2,
    },
    
    field_mapping: {
      merchant_no: ['支付宝账号', '商户编号', '账号'],
      trans_date: ['交易时间', '业务时间', '日期'],
      trans_time: ['交易时间', '业务时间'],
      lakala_serial: ['支付宝交易号', '交易号'],
      orig_lakala_serial: ['原支付宝交易号', '原交易号'],
      pay_channel: ['交易来源', '支付渠道'],
      bank_name: ['付款银行', '银行'],
      amount: ['订单金额（元）', '订单金额', '交易金额'],
      fee: ['服务费（元）', '服务费', '手续费'],
      settle_amount: ['实收金额', '结算金额', '入账金额'],
      merchant_order_no: ['商家订单号', '商户订单号', '业务订单号'],
      pay_order_no: ['支付订单号', '外部订单号'],
      remark: ['备注', '商品说明'],
    },
    
    special_rules: {
      amount_unit: 'yuan',
      time_extract_from: '业务时间',
    },
  },
  
  lakala: {
    kind: 'lakala',
    label: '拉卡拉账单',
    label_en: 'Lakala Bill',
    file_type: 'JY',
    description: '拉卡拉收单交易账单',
    
    identification: {
      filename_patterns: [/拉卡拉/i, /lakala/i, /lkl/i],
      header_keywords: [
        '拉卡拉流水号', '原拉卡拉流水号', '分支机构', '终端号',
        '结算金额(分)', '交易金额(分)', '手续费(分)',
      ],
      min_match_count: 2,
    },
    
    field_mapping: {
      merchant_no: ['商户编号', '商户号'],
      trans_date: ['交易日期', '日期'],
      trans_time: ['交易时间', '时间'],
      terminal_no: ['终端号', '终端编号'],
      branch_name: ['分支机构', '网点名称'],
      trans_type: ['交易类型', '业务类型'],
      lakala_serial: ['拉卡拉流水号', '交易流水号'],
      orig_lakala_serial: ['原拉卡拉流水号', '原交易流水号'],
      card_no: ['卡号', '银行卡号'],
      pay_channel: ['支付渠道', '渠道'],
      bank_name: ['银行名称', '银行'],
      amount: ['交易金额', '交易金额(分)'],
      fee: ['手续费', '手续费(分)'],
      settle_amount: ['结算金额', '结算金额(分)'],
      merchant_order_no: ['商户订单号', '外部订单号'],
      sys_ref_no: ['系统参考号', '参考号'],
      remark: ['备注', '说明'],
    },
    
    special_rules: {
      amount_unit: 'fen',
    },
  },
  
  meituan: {
    kind: 'meituan',
    label: '美团账单',
    label_en: 'Meituan Bill',
    file_type: 'JY',
    description: '美团平台交易账单',
    
    identification: {
      filename_patterns: [/美团/i, /meituan/i, /mt.*bill/i],
      header_keywords: [
        '美团订单号', '平台订单号', '技术服务费', '佣金',
        '商家实收', '平台补贴', '用户支付',
      ],
      min_match_count: 2,
    },
    
    field_mapping: {
      merchant_no: ['商户编号', '商家ID'],
      trans_date: ['交易日期', '结算日期', '日期'],
      lakala_serial: ['美团订单号', '平台订单号'],
      amount: ['订单金额', '交易金额', '用户支付'],
      fee: ['技术服务费', '佣金', '平台服务费'],
      settle_amount: ['商家实收', '结算金额'],
      merchant_order_no: ['商家订单号', '商户订单号'],
    },
    
    special_rules: {
      amount_unit: 'yuan',
    },
  },
  
  douyin: {
    kind: 'douyin',
    label: '抖音账单',
    label_en: 'Douyin Bill',
    file_type: 'JY',
    description: '抖音/抖音电商交易账单',
    
    identification: {
      filename_patterns: [/抖音/i, /douyin/i, /tiktok/i],
      header_keywords: [
        '抖音支付单号', '抖音订单号', '视频号', '直播订单',
        '达人佣金', '平台服务费',
      ],
      min_match_count: 2,
    },
    
    field_mapping: {
      merchant_no: ['商户编号', '店铺ID'],
      trans_date: ['交易日期', '结算日期'],
      lakala_serial: ['抖音支付单号', '抖音订单号'],
      amount: ['订单金额', '交易金额'],
      fee: ['平台服务费', '技术服务费', '达人佣金'],
      settle_amount: ['商家实收', '结算金额'],
      merchant_order_no: ['商家订单号'],
    },
    
    special_rules: {
      amount_unit: 'yuan',
    },
  },
  
  bank: {
    kind: 'bank',
    label: '银行流水',
    label_en: 'Bank Statement',
    file_type: 'JY',
    description: '银行账户交易流水',
    
    identification: {
      filename_patterns: [/银行.*流水/i, /bank.*statement/i, /账户.*明细/i],
      header_keywords: [
        '开户行', '银行账号', '账户余额', '借贷方向',
        '摘要', '对方户名', '对方账号', '入账金额', '出账金额',
      ],
      min_match_count: 2,
    },
    
    field_mapping: {
      merchant_no: ['银行账号', '账号', '账户'],
      trans_date: ['交易日期', '日期', '记账日期'],
      trans_time: ['交易时间', '时间'],
      branch_name: ['开户行', '银行网点'],
      lakala_serial: ['流水号', '交易序号'],
      bank_name: ['对方银行', '开户行'],
      amount: ['交易金额', '入账金额', '出账金额'],
      settle_amount: ['账户余额', '余额'],
      merchant_order_no: ['对方账号', '对方账户'],
      remark: ['摘要', '备注', '用途'],
    },
    
    special_rules: {
      amount_unit: 'yuan',
    },
  },
  
  other: {
    kind: 'other',
    label: '其他',
    label_en: 'Other',
    file_type: 'JY',
    description: '未识别来源的账单',
    
    identification: {
      filename_patterns: [],
      header_keywords: [],
      min_match_count: 0,
    },
    
    field_mapping: {},
  },
};

/**
 * 根据渠道类型获取模板
 */
export function getChannelTemplate(kind: ChannelKind): ChannelTemplate | null {
  return CHANNEL_TEMPLATES[kind] || null;
}

/**
 * 获取所有渠道模板列表
 */
export function getAllChannelTemplates(): ChannelTemplate[] {
  return Object.values(CHANNEL_TEMPLATES).filter(t => t.kind !== 'other');
}

/**
 * 根据表头匹配最可能的渠道
 */
export function matchChannelByHeaders(headers: string[]): { 
  kind: ChannelKind; 
  confidence: number;
  matched_keywords: string[];
} {
  const normalizedHeaders = headers.map(h => h.replace(/[\s\t]/g, '').toLowerCase());
  
  let bestMatch: { kind: ChannelKind; confidence: number; matched_keywords: string[] } = {
    kind: 'other',
    confidence: 0,
    matched_keywords: [],
  };
  
  for (const [kind, template] of Object.entries(CHANNEL_TEMPLATES)) {
    if (kind === 'other') continue;
    
    // 检查排除性关键词
    if (template.identification.header_exclusive) {
      const hasExclusive = template.identification.header_exclusive.some(kw =>
        normalizedHeaders.some(h => h.includes(kw.replace(/[\s\t]/g, '').toLowerCase()))
      );
      if (hasExclusive) continue;
    }
    
    // 统计匹配的关键词
    const matchedKeywords: string[] = [];
    for (const keyword of template.identification.header_keywords) {
      const normalizedKw = keyword.replace(/[\s\t]/g, '').toLowerCase();
      if (normalizedHeaders.some(h => h.includes(normalizedKw))) {
        matchedKeywords.push(keyword);
      }
    }
    
    if (matchedKeywords.length >= template.identification.min_match_count) {
      const confidence = Math.min(0.5 + matchedKeywords.length * 0.08, 0.95);
      if (confidence > bestMatch.confidence) {
        bestMatch = { kind: kind as ChannelKind, confidence, matched_keywords: matchedKeywords };
      }
    }
  }
  
  return bestMatch;
}
