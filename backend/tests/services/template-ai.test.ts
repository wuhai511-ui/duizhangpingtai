import { describe, it, expect } from 'vitest';
import {
  analyzeHeaders,
  generateTemplateFromAnalysis,
  inferDelimiter,
  type FieldMapping,
} from '../../src/business/services/template-ai.js';

describe('analyzeHeaders', () => {
  it('recognizes JY transaction headers', () => {
    const headers = ['商户编号', '交易日期', '交易时间', '拉卡拉流水号', '交易金额(分)', '手续费(分)', '结算金额(分)'];
    const { mappings, detectedType, confidence } = analyzeHeaders(headers, 'JY');

    expect(detectedType).toBe('JY');
    expect(confidence).toBeGreaterThan(0);
    expect(mappings.find(m => m.field === 'merchant_no')?.header).toBe('商户编号');
    expect(mappings.find(m => m.field === 'trans_date')?.header).toBe('交易日期');
    expect(mappings.find(m => m.field === 'amount')?.header).toBe('交易金额(分)');
    expect(mappings.find(m => m.field === 'lakala_serial')?.header).toBe('拉卡拉流水号');
  });

  it('recognizes JS settlement headers', () => {
    const headers = ['商户编号', '交易日期', '拉卡拉流水号', '交易金额(分)', '结算金额', '结算日期'];
    const { mappings, detectedType, confidence } = analyzeHeaders(headers, 'JS');

    expect(detectedType).toBe('JS');
    expect(mappings.find(m => m.field === 'settle_date')?.header).toBe('结算日期');
    expect(mappings.find(m => m.field === 'settle_amount')?.header).toBe('结算金额');
  });

  it('recognizes BUSINESS_ORDER headers', () => {
    const headers = ['订单编号', '订单金额', '实收金额', '通道手续费', '支付流水号'];
    const { mappings, detectedType, confidence } = analyzeHeaders(headers, 'BUSINESS_ORDER');

    expect(detectedType).toBe('BUSINESS_ORDER');
    expect(mappings.find(m => m.field === 'order_no')?.header).toBe('订单编号');
    expect(mappings.find(m => m.field === 'order_amount')?.header).toBe('订单金额');
    expect(mappings.find(m => m.field === 'pay_serial_no')?.header).toBe('支付流水号');
  });

  it('marks unknown headers with field=unknown', () => {
    const headers = ['未知字段A', '商户编号', '未知字段B'];
    const { mappings } = analyzeHeaders(headers);

    const unknownFields = mappings.filter(m => m.field === 'unknown');
    expect(unknownFields).toHaveLength(2);
    expect(unknownFields[0].header).toBe('未知字段A');
    expect(unknownFields[1].header).toBe('未知字段B');
  });

  it('does fuzzy match on aliases', () => {
    const headers = ['商户号', '日期', '金额', '流水号'];
    const { mappings } = analyzeHeaders(headers, 'JY');

    const mapped = mappings.filter(m => m.field !== 'unknown');
    expect(mapped.length).toBeGreaterThan(0);
  });
});

describe('inferDelimiter', () => {
  it('infers pipe delimiter', () => {
    expect(inferDelimiter('a|b|c')).toBe('|');
  });

  it('infers tab delimiter', () => {
    expect(inferDelimiter('a\tb\tc')).toBe('\t');
  });

  it('infers comma delimiter', () => {
    expect(inferDelimiter('a,b,c')).toBe(',');
  });
});

describe('generateTemplateFromAnalysis', () => {
  it('generates template with correct structure', () => {
    const headers = ['商户编号', '交易日期', '拉卡拉流水号', '交易金额(分)'];
    const mappings: FieldMapping[] = [
      { header: '商户编号', field: 'merchant_no', confidence: 0.9, type: 'string', required: true },
      { header: '交易日期', field: 'trans_date', confidence: 0.9, type: 'date', required: true },
      { header: '拉卡拉流水号', field: 'lakala_serial', confidence: 0.9, type: 'string', required: true },
      { header: '交易金额(分)', field: 'amount', confidence: 0.9, type: 'amount', required: true },
    ];

    const template = generateTemplateFromAnalysis(headers, mappings, 'JY', 1.0);

    expect(template.type).toBe('JY');
    expect(template.delimiter).toBe('|');
    expect(template.fieldConfig.fields).toHaveLength(4);
    expect(template.confidence).toBe(1.0);
    expect(template.name).toContain('JY');
    expect(template.fieldConfig.amountUnit).toBe('fen'); // 表头含(分)
  });

  it('defaults to yuan when no (分) marker', () => {
    const headers = ['商户编号', '金额'];
    const mappings: FieldMapping[] = [
      { header: '商户编号', field: 'merchant_no', confidence: 1, type: 'string', required: true },
      { header: '金额', field: 'amount', confidence: 1, type: 'amount', required: true },
    ];

    const template = generateTemplateFromAnalysis(headers, mappings, 'JY', 1.0);
    expect(template.fieldConfig.amountUnit).toBe('yuan');
  });
});
