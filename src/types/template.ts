export const BUSINESS_ORDER_CANONICAL_FIELDS = [
  'order_no',
  'order_type',
  'pay_method',
  'channel_name',
  'customer_phone',
  'customer_name',
  'order_amount',
  'received_amount',
  'paid_amount',
  'channel_fee',
  'order_status',
  'pay_serial_no',
  'orig_serial_no',
  'trans_date',
] as const;

export type BusinessOrderCanonicalField = (typeof BUSINESS_ORDER_CANONICAL_FIELDS)[number];

export const REQUIRED_BUSINESS_ORDER_FIELDS = ['order_no', 'order_amount'] as const;

export type RequiredBusinessOrderField = (typeof REQUIRED_BUSINESS_ORDER_FIELDS)[number];

export const TRANSFORM_RULES = [
  'identity',
  'trim',
  'yuan_to_fen',
  'fen_identity',
  'datetime_to_date',
  'excel_date_to_date',
  'strip_non_digits',
  'empty_to_null',
] as const;

export type TransformRule = (typeof TRANSFORM_RULES)[number];

export interface FileProfile {
  format: 'txt' | 'csv' | 'xlsx' | 'xls';
  delimiter: ',' | '|' | '\t' | null;
  headerRow: number;
  dataStartRow: number;
  headers: string[];
  sampleRows: string[][];
  fingerprint: string;
  columnCount: number;
  filename: string;
}

export interface TemplateMatchRules {
  format?: FileProfile['format'];
  delimiter?: FileProfile['delimiter'];
  columnCount?: number;
  headerKeywords?: string[];
  filenamePatterns?: string[];
  sourceHint?: string | null;
  fingerprint?: string | null;
}

export interface TemplateMappingConfig {
  fieldMapping: Partial<Record<string, BusinessOrderCanonicalField>>;
  transforms: Partial<Record<BusinessOrderCanonicalField, TransformRule>>;
  requiredMissing: RequiredBusinessOrderField[];
  unmappedColumns: string[];
  confidence: number;
}

export interface TemplateAiMappingResult extends TemplateMappingConfig {
  headerRow: number;
  dataStartRow: number;
  delimiter: FileProfile['delimiter'];
  reasoning: string[];
}

export function isBusinessOrderCanonicalField(value: string): value is BusinessOrderCanonicalField {
  return (BUSINESS_ORDER_CANONICAL_FIELDS as readonly string[]).includes(value);
}

export function isTransformRule(value: string): value is TransformRule {
  return (TRANSFORM_RULES as readonly string[]).includes(value);
}

export function getMissingRequiredBusinessOrderFields(
  mappedFields: Iterable<BusinessOrderCanonicalField>,
): RequiredBusinessOrderField[] {
  const mapped = new Set(mappedFields);
  return REQUIRED_BUSINESS_ORDER_FIELDS.filter((field) => !mapped.has(field));
}
