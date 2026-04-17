import type {
  BusinessOrderCanonicalField,
  FileProfile,
  TemplateAiMappingResult,
  TemplateMappingConfig,
  TemplateMatchRules,
  TransformRule,
} from './template';

export interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data: T;
  pagination?: Pagination;
}

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
}

export interface PaginatedResponse<T> {
  list: T[];
  pagination: Pagination;
}

export interface User {
  id: string;
  username: string;
  role: 'admin' | 'operator' | 'viewer';
  name: string;
}

export interface Merchant {
  id: string;
  merchant_no: string;
  name: string;
  status: number;
  created_at: string;
  updated_at: string;
}

export interface Transaction {
  id: string;
  merchant_id: string;
  trans_date: string;
  trans_time: string;
  lakala_serial: string;
  trans_type: string;
  amount: number;
  fee: number;
  settle_amount: number;
  pay_channel: string;
  merchant_order_no: string;
}

export interface AIQueryResult {
  answer: string;
  sql: string;
  records: unknown[];
  confidence: number;
  llm: string;
}

export interface AIConversation {
  id: string;
  title: string;
  merchant_id?: string | null;
  created_by?: string | null;
  latest_message_preview?: string | null;
  latest_message_type?: string | null;
  last_message_at: string;
  created_at: string;
  updated_at: string;
}

export interface AIConversationMessage {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  message_type: 'text' | 'sql_result' | 'file_notice' | 'reconcile_result';
  content: string;
  sql_text?: string | null;
  meta_json?: Record<string, unknown> | null;
  created_at: string;
}

export interface ConversationReply {
  user_message: AIConversationMessage;
  assistant_message: AIConversationMessage;
}

export interface ConversationReconcileResult {
  batch_id: string;
  batch_no: string;
  stats: ReconcileStats;
  message: AIConversationMessage;
}

export type UploadFileType =
  | 'JY'
  | 'JS'
  | 'SEP'
  | 'JZ'
  | 'ACC'
  | 'DW'
  | 'D0'
  | 'JY_FQ'
  | 'INVOICE'
  | 'BUSINESS_ORDER';

export interface FileUploadResult {
  file_id: string;
  records: number;
  type: string;
}

export interface FileInfo {
  id: string;
  filename: string;
  type: string;
  records: number;
  status: string;
  createdAt: string;
}

export interface ReconcileRequest {
  business_file_id?: string;
  channel_file_id?: string;
  batch_type?: 'ORDER_VS_JY' | 'JY_VS_JS';
  check_date?: string;
}

export interface ReconcileStats {
  total: number;
  match: number;
  rolling: number;
  long: number;
  short: number;
  amount_diff: number;
}

export interface ReconcileResult {
  batch_id: string;
  batch_no: string;
  stats: ReconcileStats;
  message: string;
}

export interface ReconciliationBatch {
  id: string;
  batch_no: string;
  check_date: string;
  batch_type: 'ORDER_VS_JY' | 'JY_VS_JS';
  business_file_id?: string | null;
  channel_file_id?: string | null;
  record_count: number;
  total_amount: string;
  match_count?: number | null;
  rolling_count?: number | null;
  long_count?: number | null;
  short_count?: number | null;
  amount_diff_count?: number | null;
  status: number;
  error_msg?: string | null;
  started_at?: string;
  finished_at?: string | null;
}

export interface ReconciliationDetailItem {
  id: string;
  batch_id: string;
  serial_no: string;
  result_type: string;
  business_amount?: string | null;
  channel_amount?: string | null;
  diff_amount?: string | null;
  match_date?: string | null;
  business_data?: string | null;
  channel_data?: string | null;
  created_at?: string;
}

export interface SavedTemplate {
  id: string;
  name: string;
  type: string;
  field_config: TemplateMappingConfig;
  match_rules: TemplateMatchRules;
  delimiter: string | null;
  header_row: number;
  data_start_row: number;
  sample_fingerprint?: string | null;
  confidence?: number | null;
  source_hint?: string | null;
  version: number;
  created_by?: string | null;
  is_default: boolean;
  created_at?: string;
}

export interface TemplateAnalyzeResult {
  matched_template: (SavedTemplate & {
    match_score?: number;
    mismatch_reasons?: string[];
  }) | null;
  profile: {
    format: FileProfile['format'];
    delimiter: FileProfile['delimiter'];
    header_row: number;
    data_start_row: number;
    headers: string[];
    sample_rows: string[][];
    fingerprint: string;
    column_count: number;
  };
  ai_mapping: TemplateAiMappingResult | null;
}

export interface SaveBusinessOrderTemplatePayload {
  name: string;
  field_config: TemplateMappingConfig;
  profile: TemplateAnalyzeResult['profile'];
  match_rules?: TemplateMatchRules;
  confidence?: number;
  source_hint?: string;
  created_by?: string;
  is_default?: boolean;
}

export interface TemplateImportPayload {
  template_id: string;
  filename: string;
  content_base64: string;
}

export interface TemplateImportResult {
  file_id: string;
  template_id: string;
  records: number;
  warnings?: string[];
}

export type {
  BusinessOrderCanonicalField,
  FileProfile,
  TemplateAiMappingResult,
  TemplateMappingConfig,
  TemplateMatchRules,
  TransformRule,
};
