// API响应格式
export interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data: T;
}

// 分页响应
export interface PaginatedResponse<T> {
  list: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
  };
}

// 用户
export interface User {
  id: string;
  username: string;
  role: 'admin' | 'operator' | 'viewer';
  name: string;
}

// 商户
export interface Merchant {
  id: string;
  merchant_no: string;
  name: string;
  status: number;
  created_at: string;
  updated_at: string;
}

// 交易
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

// 对账结果
export interface Reconciliation {
  batch_id: string;
  check_date: string;
  file_type: string;
  record_count: number;
  match_count: number;
  mismatch_count: number;
  status: number;
}

// AI查询结果
export interface AIQueryResult {
  answer: string;
  sql: string;
  records: unknown[];
  confidence: number;
  llm: string;
}
