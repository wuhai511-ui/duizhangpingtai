import type { UploadFileType } from '../types';

export interface SourceTemplate {
  key: string;
  label: string;
  filenameKeywords: string[];
  headerKeywords: string[];
  fileTypes?: UploadFileType[];
}

export interface SourceDetection {
  key: string;
  label: string;
  confidence: number;
  matchedHeaders: string[];
  filenameMatched: boolean;
}

export const SOURCE_TEMPLATES: SourceTemplate[] = [
  {
    key: 'wechat',
    label: '微信账单',
    filenameKeywords: ['微信', 'wechat', 'wx'],
    headerKeywords: ['微信订单号', '公众账号ID', '应结订单金额', '商户数据包', '申请退款金额', '交易状态'],
    fileTypes: ['JY', 'JS'],
  },
  {
    key: 'lakala',
    label: '拉卡拉账单',
    filenameKeywords: ['拉卡拉', 'lakala', 'jy_', 'js_'],
    headerKeywords: ['拉卡拉流水号', '商户号', '终端号', '系统参考号', '结算金额', '支付渠道'],
    fileTypes: ['JY', 'JS'],
  },
  {
    key: 'alipay',
    label: '支付宝账单',
    filenameKeywords: ['支付宝', 'alipay', 'zfb'],
    headerKeywords: ['支付宝交易号', '商家订单号', '业务时间', '订单金额（元）', '服务费（元）', '账务类型'],
    fileTypes: ['JY', 'JS'],
  },
  {
    key: 'meituan',
    label: '美团账单',
    filenameKeywords: ['美团', 'meituan', 'mt'],
    headerKeywords: ['美团订单号', '结算金额', '佣金', '技术服务费', '入住日期', '离店日期'],
    fileTypes: ['JY', 'JS', 'BUSINESS_ORDER'],
  },
  {
    key: 'douyin',
    label: '抖音账单',
    filenameKeywords: ['抖音', 'douyin', '字节'],
    headerKeywords: ['抖音支付单号', '平台订单号', '交易创建时间', '技术服务费', '达人佣金', '结算金额'],
    fileTypes: ['JY', 'JS'],
  },
  {
    key: 'bank',
    label: '银行流水',
    filenameKeywords: ['银行', '对账单', '流水', 'statement'],
    headerKeywords: ['借方发生额', '贷方发生额', '账户余额', '交易机构', '摘要', '附言'],
    fileTypes: ['JY', 'JS'],
  },
];

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

export function detectSourceTemplate(input: {
  filename?: string;
  headers?: string[];
  fileType?: UploadFileType;
}): SourceDetection | null {
  const filename = normalizeText(input.filename || '');
  const headers = (input.headers || []).map((header) => normalizeText(header)).filter(Boolean);

  let bestMatch: SourceDetection | null = null;

  for (const template of SOURCE_TEMPLATES) {
    if (input.fileType && template.fileTypes && !template.fileTypes.includes(input.fileType)) {
      continue;
    }

    const matchedHeaders = template.headerKeywords.filter((keyword) =>
      headers.some((header) => header.includes(normalizeText(keyword))),
    );
    const filenameMatched = template.filenameKeywords.some((keyword) =>
      filename.includes(normalizeText(keyword)),
    );

    const headerScore = template.headerKeywords.length
      ? matchedHeaders.length / template.headerKeywords.length
      : 0;
    const filenameScore = filenameMatched ? 0.35 : 0;
    const confidence = Math.min(1, headerScore * 0.8 + filenameScore);

    if (confidence < 0.25) {
      continue;
    }

    if (!bestMatch || confidence > bestMatch.confidence) {
      bestMatch = {
        key: template.key,
        label: template.label,
        confidence,
        matchedHeaders,
        filenameMatched,
      };
    }
  }

  return bestMatch;
}
