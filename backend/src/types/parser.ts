export interface ParseResult<T> {
  success: boolean;
  records: T[];
  error?: string;
}

export interface JyTransaction {
  merchant_no: string;
  trans_date: string;
  trans_time: string;
  terminal_no?: string;
  branch_name?: string;
  trans_type?: string;
  lakala_serial: string;
  orig_lakala_serial?: string;
  card_no?: string;
  pay_channel?: string;
  bank_name?: string;
  amount: number;
  fee: number;
  settle_amount: number;
  merchant_order_no?: string;
  pay_order_no?: string;
  external_serial?: string;
  sys_ref_no?: string;
  remark?: string;
  pay_method?: string;
}

// 结算明细
export interface JsSettlement {
  merchant_no: string;
  trans_date: string;
  trans_time: string;
  terminal_no?: string;
  lakala_serial: string;
  amount: number;
  fee: number;
  settle_amount: number;
  settle_date: string;
  settle_status: number;
}

// 钱包结算
export interface JzWalletSettlement {
  merchant_no: string;
  settle_date: string;
  wallet_type: string;
  amount: number;
  fee: number;
  settle_amount: number;
}

// 账户结算
export interface AccAccountSettlement {
  merchant_no: string;
  account_no: string;
  settle_date: string;
  amount: number;
  fee: number;
  settle_amount: number;
}

// 分账交易
export interface SepTransaction {
  merchant_no: string;
  trans_date: string;
  lakala_serial: string;
  amount: number;
  sep_amount: number;
  sep_rate: number;
}

// 提现对账
export interface DwWithdrawal {
  merchant_no: string;
  withdraw_date: string;
  withdraw_serial: string;
  amount: number;
  fee: number;
  status: number;
}

// D0 提现
export interface D0Withdrawal {
  merchant_no: string;
  trans_date: string;
  lakala_serial: string;
  amount: number;
  fee: number;
  d0_fee: number;
}

// 分期交易
export interface JyInstallment {
  merchant_no: string;
  trans_date: string;
  lakala_serial: string;
  amount: number;
  installment_count: number;
  per_amount: number;
}
