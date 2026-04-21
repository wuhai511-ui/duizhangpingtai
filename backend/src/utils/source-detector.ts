/**
 * 文件来源识别工具
 * 根据文件名、表头、内容特征识别文件来源
 */

export type SourceKind = 'wechat' | 'alipay' | 'lakala' | 'meituan' | 'douyin' | 'bank' | 'other';

export interface SourceDetectionResult {
  source_label: string;  // 中文标签：微信账单/支付宝账单/拉卡拉账单
  source_kind: SourceKind; // 类型标识
  confidence: number;    // 置信度 0-1
  matched_rules: string[]; // 匹配的规则
}

// 来源特征配置
const SOURCE_SIGNATURES: Record<SourceKind, {
  label: string;
  filename_patterns: RegExp[];
  header_keywords: string[];
  header_exclusive?: string[]; // 排他性关键词（有这些则不是该来源）
}> = {
  wechat: {
    label: '微信账单',
    filename_patterns: [
      /微信/i,
      /wechat/i,
      /wx.*bill/i,
      /wechat.*transaction/i,
    ],
    header_keywords: [
      '公众账号ID', '微信订单号', '微信支付订单号', '商户号(微信)',
      '付款银行', '应结订单金额', '费率备注', '微信退款单号',
    ],
    header_exclusive: ['支付宝交易号', 'alipay'],
  },
  alipay: {
    label: '支付宝账单',
    filename_patterns: [
      /支付宝/i,
      /alipay/i,
      /ali.*bill/i,
    ],
    header_keywords: [
      '支付宝交易号', '商家订单号', '业务时间', '支付宝账号',
      '订单金额（元）', '服务费（元）', '实收金额', '退款金额',
    ],
    header_exclusive: ['公众账号ID', '微信订单号'],
  },
  lakala: {
    label: '拉卡拉账单',
    filename_patterns: [
      /拉卡拉/i,
      /lakala/i,
      /lkl/i,
    ],
    header_keywords: [
      '拉卡拉流水号', '原拉卡拉流水号', '分支机构', '终端号',
      '结算金额(分)', '交易金额(分)', '手续费(分)',
    ],
  },
  meituan: {
    label: '美团账单',
    filename_patterns: [
      /美团/i,
      /meituan/i,
      /mt.*bill/i,
    ],
    header_keywords: [
      '美团订单号', '平台订单号', '技术服务费', '佣金',
      '商家实收', '平台补贴', '用户支付',
    ],
  },
  douyin: {
    label: '抖音账单',
    filename_patterns: [
      /抖音/i,
      /douyin/i,
      /tiktok/i,
      /tt.*bill/i,
    ],
    header_keywords: [
      '抖音支付单号', '抖音订单号', '视频号', '直播订单',
      '达人佣金', '平台服务费',
    ],
  },
  bank: {
    label: '银行流水',
    filename_patterns: [
      /银行.*流水/i,
      /bank.*statement/i,
      /账户.*明细/i,
      /流水.*明细/i,
    ],
    header_keywords: [
      '开户行', '银行账号', '账户余额', '借贷方向',
      '摘要', '对方户名', '对方账号', '入账金额', '出账金额',
    ],
  },
  other: {
    label: '其他',
    filename_patterns: [],
    header_keywords: [],
  },
};

/**
 * 根据文件名检测来源
 */
export function detectSourceByFilename(filename: string): SourceDetectionResult | null {
  const kinds: SourceKind[] = ['wechat', 'alipay', 'lakala', 'meituan', 'douyin', 'bank'];
  
  for (const kind of kinds) {
    const sig = SOURCE_SIGNATURES[kind];
    for (const pattern of sig.filename_patterns) {
      if (pattern.test(filename)) {
        return {
          source_label: sig.label,
          source_kind: kind,
          confidence: 0.7,
          matched_rules: [`filename:${pattern.source}`],
        };
      }
    }
  }
  
  return null;
}

/**
 * 根据表头检测来源
 */
export function detectSourceByHeaders(headers: string[]): SourceDetectionResult | null {
  const kinds: SourceKind[] = ['wechat', 'alipay', 'lakala', 'meituan', 'douyin', 'bank'];
  const normalizedHeaders = headers.map(h => h.replace(/[\s\t]/g, '').toLowerCase());
  
  let bestResult: SourceDetectionResult | null = null;
  
  for (const kind of kinds) {
    const sig = SOURCE_SIGNATURES[kind];
    let matchCount = 0;
    const matchedRules: string[] = [];
    
    // 检查排除性关键词
    if (sig.header_exclusive) {
      const hasExclusive = sig.header_exclusive.some(kw => 
        normalizedHeaders.some(h => h.includes(kw.replace(/[\s\t]/g, '').toLowerCase()))
      );
      if (hasExclusive) continue;
    }
    
    // 统计匹配的关键词数量
    for (const keyword of sig.header_keywords) {
      const normalizedKeyword = keyword.replace(/[\s\t]/g, '').toLowerCase();
      if (normalizedHeaders.some(h => h.includes(normalizedKeyword))) {
        matchCount++;
        matchedRules.push(`header:${keyword}`);
      }
    }
    
    // 至少匹配2个关键词才认为有效
    if (matchCount >= 2) {
      const confidence = Math.min(0.5 + matchCount * 0.1, 0.95);
      if (!bestResult || confidence > bestResult.confidence) {
        bestResult = {
          source_label: sig.label,
          source_kind: kind,
          confidence,
          matched_rules: matchedRules,
        };
      }
    }
  }
  
  return bestResult;
}

/**
 * 综合检测文件来源
 */
export function detectSource(filename: string, headers: string[] = []): SourceDetectionResult {
  // 优先用表头检测（更准确）
  if (headers.length > 0) {
    const headerResult = detectSourceByHeaders(headers);
    if (headerResult && headerResult.confidence >= 0.7) {
      return headerResult;
    }
  }
  
  // 其次用文件名检测
  const filenameResult = detectSourceByFilename(filename);
  if (filenameResult) {
    // 如果表头也有部分匹配，提升置信度
    if (headers.length > 0) {
      const headerResult = detectSourceByHeaders(headers);
      if (headerResult && headerResult.source_kind === filenameResult.source_kind) {
        return {
          ...filenameResult,
          confidence: Math.min(filenameResult.confidence + 0.2, 0.95),
          matched_rules: [...filenameResult.matched_rules, ...headerResult.matched_rules],
        };
      }
    }
    return filenameResult;
  }
  
  // 表头检测低置信度结果
  if (headers.length > 0) {
    const headerResult = detectSourceByHeaders(headers);
    if (headerResult) {
      return headerResult;
    }
  }
  
  // 无法识别
  return {
    source_label: '其他',
    source_kind: 'other',
    confidence: 0,
    matched_rules: [],
  };
}

/**
 * 获取所有支持的来源类型
 */
export function getSupportedSources(): Array<{ kind: SourceKind; label: string }> {
  return Object.entries(SOURCE_SIGNATURES)
    .filter(([kind]) => kind !== 'other')
    .map(([kind, sig]) => ({ kind: kind as SourceKind, label: sig.label }));
}
