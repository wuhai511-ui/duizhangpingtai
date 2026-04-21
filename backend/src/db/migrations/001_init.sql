-- 业财一体化 MVP 数据库初始化脚本
-- 创建 12 张表：raw_files + 11 张业务表

-- 启用 UUID 扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 1. 原始文件记录表
-- ============================================================================
CREATE TABLE raw_files (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_type     VARCHAR(10)  NOT NULL,  -- JY/JS/JZ/ACC/SEP/SEP_SUM/DW/DW_RD/D0/JY_FQ/PNG
  file_name     VARCHAR(255) NOT NULL,
  file_date     DATE         NOT NULL,   -- 文件名中的日期
  institution   VARCHAR(20) NOT NULL,   -- 机构号
  status        SMALLINT    NOT NULL DEFAULT 0,  -- 0=待处理 1=处理中 2=成功 3=失败
  record_count  INTEGER,
  total_amount  BIGINT,                  -- 单位：分，汇总用
  error_msg     TEXT,
  file_size     BIGINT,
  checksum      VARCHAR(64),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at  TIMESTAMPTZ
);

CREATE INDEX idx_raw_files_type_date ON raw_files(file_type, file_date);
CREATE INDEX idx_raw_files_status ON raw_files(status);

-- ============================================================================
-- 2. 交易明细对账单
-- ============================================================================
CREATE TABLE jy_transactions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_file_id       UUID NOT NULL REFERENCES raw_files(id),
  merchant_no       VARCHAR(32) NOT NULL,
  trans_date        DATE NOT NULL,
  trans_time        TIME NOT NULL,
  terminal_no       VARCHAR(32),
  branch_name       VARCHAR(128),
  trans_type        VARCHAR(20),
  lakala_serial     VARCHAR(64) NOT NULL,
  orig_lakala_serial VARCHAR(64),
  card_no           VARCHAR(32),
  pay_channel       VARCHAR(32),
  bank_name         VARCHAR(64),
  amount            BIGINT NOT NULL,          -- 单位：分
  fee               BIGINT NOT NULL,           -- 单位：分
  settle_amount     BIGINT NOT NULL,           -- 单位：分
  merchant_order_no VARCHAR(64),
  pay_order_no      VARCHAR(64),
  external_serial   VARCHAR(64),
  sys_ref_no        VARCHAR(64),
  remark            TEXT,
  pay_method        VARCHAR(20),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(lakala_serial)
);

CREATE INDEX idx_jy_trans_date ON jy_transactions(trans_date);
CREATE INDEX idx_jy_merchant ON jy_transactions(merchant_no, trans_date);

-- ============================================================================
-- 3. 结算明细对账单
-- ============================================================================
CREATE TABLE js_settlements (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_file_id       UUID NOT NULL REFERENCES raw_files(id),
  merchant_no       VARCHAR(32) NOT NULL,
  trans_date        DATE NOT NULL,
  trans_time        TIME NOT NULL,
  terminal_no       VARCHAR(32),
  branch_name       VARCHAR(128),
  trans_type        VARCHAR(20),
  lakala_serial     VARCHAR(64) NOT NULL,
  orig_lakala_serial VARCHAR(64),
  card_no           VARCHAR(32),
  pay_channel       VARCHAR(32),
  bank_name         VARCHAR(64),
  amount            BIGINT NOT NULL,
  fee               BIGINT NOT NULL,
  settle_amount     BIGINT NOT NULL,
  merchant_order_no VARCHAR(64),
  pay_order_no      VARCHAR(64),
  external_serial   VARCHAR(64),
  sys_ref_no        VARCHAR(64),
  remark            TEXT,
  pay_method        VARCHAR(20),
  settle_date       DATE NOT NULL,
  settle_status     SMALLINT NOT NULL DEFAULT 0 CHECK (settle_status BETWEEN 0 AND 3),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(lakala_serial)
);

CREATE INDEX idx_js_settle_date ON js_settlements(settle_date);

-- ============================================================================
-- 4. 钱包结算明细
-- ============================================================================
CREATE TABLE jz_wallet_settlements (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_file_id       UUID NOT NULL REFERENCES raw_files(id),
  wallet_account    VARCHAR(32) NOT NULL,
  merchant_no       VARCHAR(32) NOT NULL,
  trans_date        DATE NOT NULL,
  trans_time        TIME NOT NULL,
  terminal_no       VARCHAR(32),
  branch_name       VARCHAR(128),
  trans_type        VARCHAR(20),
  lakala_serial     VARCHAR(64) NOT NULL,
  orig_lakala_serial VARCHAR(64),
  card_no           VARCHAR(32),
  pay_channel       VARCHAR(32),
  bank_name         VARCHAR(64),
  amount            BIGINT NOT NULL,
  fee               BIGINT NOT NULL,
  settle_amount     BIGINT NOT NULL,
  merchant_order_no VARCHAR(64),
  pay_order_no      VARCHAR(64),
  external_serial   VARCHAR(64),
  sys_ref_no        VARCHAR(64),
  remark            TEXT,
  pay_method        VARCHAR(20),
  settle_date       DATE NOT NULL,
  settle_status     SMALLINT NOT NULL DEFAULT 0 CHECK (settle_status BETWEEN 0 AND 3),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(lakala_serial)
);

CREATE INDEX idx_jz_wallet_acc ON jz_wallet_settlements(wallet_account);

-- ============================================================================
-- 5. 账户结算明细
-- ============================================================================
CREATE TABLE acc_account_settlements (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_file_id            UUID NOT NULL REFERENCES raw_files(id),
  merchant_no            VARCHAR(32) NOT NULL,
  merchant_name          VARCHAR(128),
  account_no             VARCHAR(32) NOT NULL,
  account_name           VARCHAR(128),
  trans_date             DATE NOT NULL,
  trans_time             TIME NOT NULL,
  settle_time            TIMESTAMPTZ,
  into_account           VARCHAR(32),
  into_account_name      VARCHAR(128),
  amount                 BIGINT NOT NULL,           -- 单位：分
  fee                    BIGINT NOT NULL,            -- 单位：分
  account_change         BIGINT NOT NULL,            -- 单位：分
  balance                BIGINT NOT NULL,            -- 单位：分
  biz_scene              VARCHAR(32),                -- 业务场景
  external_request_serial VARCHAR(64),
  lakala_serial          VARCHAR(64) NOT NULL,
  account_serial         VARCHAR(64),
  settle_cycle           VARCHAR(20),
  remark                 TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(lakala_serial)
);

CREATE INDEX idx_acc_settle_date ON acc_account_settlements(trans_date);
CREATE INDEX idx_acc_account ON acc_account_settlements(account_no);

-- ============================================================================
-- 6. 分账交易对账单
-- ============================================================================
CREATE TABLE sep_transactions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_file_id         UUID NOT NULL REFERENCES raw_files(id),
  sep_date            DATE NOT NULL,
  sep_time            TIME NOT NULL,
  sep_type            VARCHAR(20),
  sep_merchant_no     VARCHAR(32) NOT NULL,
  sep_merchant_name   VARCHAR(128),
  terminal_no         VARCHAR(32),
  sep_receiver_no     VARCHAR(32) NOT NULL,
  sep_total_amount    BIGINT NOT NULL,           -- 单位：分
  sep_amount          BIGINT NOT NULL,           -- 单位：分
  sep_status          SMALLINT NOT NULL DEFAULT 0 CHECK (sep_status BETWEEN 0 AND 4),
  sep_serial          VARCHAR(64) NOT NULL,
  orig_trans_serial   VARCHAR(64),
  external_serial     VARCHAR(64),
  sep_accept_no       VARCHAR(64),
  sep_rule            VARCHAR(64),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(sep_serial)
);

CREATE INDEX idx_sep_date ON sep_transactions(sep_date);
CREATE INDEX idx_sep_merchant ON sep_transactions(sep_merchant_no);

-- ============================================================================
-- 7. 分账交易汇总
-- ============================================================================
CREATE TABLE sep_summaries (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_file_id         UUID NOT NULL REFERENCES raw_files(id),
  sep_date            DATE NOT NULL,
  merchant_no         VARCHAR(32) NOT NULL,
  merchant_name       VARCHAR(128),
  receiver_no         VARCHAR(32) NOT NULL,
  receiver_name       VARCHAR(128),
  trans_count         INTEGER NOT NULL DEFAULT 0,
  sep_amount          BIGINT NOT NULL,           -- 单位：分
  sep_fee             BIGINT NOT NULL,            -- 单位：分
  sep_settle_amount   BIGINT NOT NULL,            -- 单位：分
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sep_sum_date ON sep_summaries(sep_date);

-- ============================================================================
-- 8. 账户提现对账单
-- ============================================================================
CREATE TABLE dw_withdrawals (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_file_id         UUID NOT NULL REFERENCES raw_files(id),
  merchant_no         VARCHAR(32) NOT NULL,
  account_no          VARCHAR(32) NOT NULL,
  withdraw_date       DATE NOT NULL,
  withdraw_time       TIME NOT NULL,
  withdraw_amount     BIGINT NOT NULL,            -- 单位：分
  fee                 BIGINT NOT NULL,             -- 单位：分
  complete_date       DATE,
  complete_time       TIME,
  arrival_mode        SMALLINT NOT NULL CHECK (arrival_mode IN (1, 2)),
  settle_mode         SMALLINT NOT NULL CHECK (settle_mode IN (1, 2)),
  withdraw_status     SMALLINT NOT NULL DEFAULT 0 CHECK (withdraw_status BETWEEN 0 AND 3),
  withdraw_serial     VARCHAR(64) NOT NULL,
  external_serial     VARCHAR(64),
  bank_account        VARCHAR(32),
  bank_name           VARCHAR(64),
  bank_line_no        VARCHAR(32),
  bank                VARCHAR(64),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(withdraw_serial)
);

CREATE INDEX idx_dw_withdraw_date ON dw_withdrawals(withdraw_date);

-- ============================================================================
-- 9. 提现退单
-- ============================================================================
CREATE TABLE dw_refunds (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_file_id         UUID NOT NULL REFERENCES raw_files(id),
  merchant_no         VARCHAR(32) NOT NULL,
  account_no          VARCHAR(32) NOT NULL,
  withdraw_date       DATE NOT NULL,
  withdraw_time       TIME NOT NULL,
  withdraw_amount     BIGINT NOT NULL,
  fee                 BIGINT NOT NULL,
  complete_date       DATE,
  complete_time       TIME,
  arrival_mode        SMALLINT NOT NULL CHECK (arrival_mode IN (1, 2)),
  settle_mode         SMALLINT NOT NULL CHECK (settle_mode IN (1, 2)),
  withdraw_status     SMALLINT NOT NULL DEFAULT 0,
  withdraw_serial     VARCHAR(64) NOT NULL,
  external_serial     VARCHAR(64),
  bank_account        VARCHAR(32),
  bank_name           VARCHAR(64),
  bank_line_no        VARCHAR(32),
  bank                VARCHAR(64),
  return_reason       VARCHAR(256),             -- 退票原因
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(withdraw_serial)
);

CREATE INDEX idx_dw_refund_date ON dw_refunds(withdraw_date);

-- ============================================================================
-- 10. D0 提现
-- ============================================================================
CREATE TABLE d0_withdrawals (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_file_id         UUID NOT NULL REFERENCES raw_files(id),
  merchant_no         VARCHAR(32) NOT NULL,
  merchant_name       VARCHAR(128),
  withdraw_date       DATE NOT NULL,
  withdraw_time       TIME NOT NULL,
  d0_amount           BIGINT NOT NULL,            -- 单位：分
  d0_fee              BIGINT NOT NULL,             -- 单位：分
  arrival_amount      BIGINT NOT NULL,             -- 单位：分
  into_account        VARCHAR(32) NOT NULL,
  withdraw_status     SMALLINT NOT NULL DEFAULT 0 CHECK (withdraw_status BETWEEN 0 AND 2),
  fail_reason         VARCHAR(256),
  into_account_name   VARCHAR(128),
  into_bank_branch    VARCHAR(128),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_d0_withdraw_date ON d0_withdrawals(withdraw_date);

-- ============================================================================
-- 11. 分期交易
-- ============================================================================
CREATE TABLE jy_installments (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_file_id          UUID NOT NULL REFERENCES raw_files(id),
  merchant_no          VARCHAR(32) NOT NULL,
  merchant_name        VARCHAR(128),
  terminal_no          VARCHAR(32),
  branch_name          VARCHAR(128),
  lakala_order_no      VARCHAR(64) NOT NULL,
  amount               BIGINT NOT NULL,              -- 单位：分
  settle_amount        BIGINT NOT NULL,              -- 单位：分
  sep_serial           VARCHAR(64),
  external_serial      VARCHAR(64),
  sep_date             DATE,
  sep_time             TIME,
  sep_type             VARCHAR(20),
  receiver_no          VARCHAR(32),
  receiver_name        VARCHAR(128),
  sep_total_amount     BIGINT,                      -- 单位：分
  sep_rule             VARCHAR(64),
  sep_amount           BIGINT,                      -- 单位：分
  sep_fee              BIGINT,                      -- 单位：分
  sep_arrival_amount   BIGINT,                      -- 单位：分
  sep_status           SMALLINT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(lakala_order_no)
);

CREATE INDEX idx_jy_fq_date ON jy_installments(sep_date);

-- ============================================================================
-- 12. 电子签购单
-- ============================================================================
CREATE TABLE png_receipts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_file_id   UUID NOT NULL REFERENCES raw_files(id),
  png_filename  VARCHAR(128) NOT NULL,  -- 如 订单号.png
  order_no      VARCHAR(64),              -- 从文件名提取的订单号
  merchant_name VARCHAR(128),
  merchant_no   VARCHAR(32),
  terminal_no   VARCHAR(32),
  operator      VARCHAR(32),
  acquire_inst  VARCHAR(32),             -- 收单机构
  trans_type    VARCHAR(20),
  pay_channel   VARCHAR(32),
  batch_no      VARCHAR(32),
  order_no2     VARCHAR(64),             -- 订单号
  auth_no       VARCHAR(32),             -- 授权号
  ref_no        VARCHAR(32),             -- 参考号
  trans_datetime TIMESTAMPTZ,
  actual_amount BIGINT,                  -- 实付金额，单位：分
  order_amount  BIGINT,                  -- 订单金额，单位：分
  discount_amount BIGINT,               -- 优惠金额，单位：分
  card_no       VARCHAR(32),
  signer        VARCHAR(64),             -- 持卡人签名（存文件名）
  local_path    VARCHAR(512),            -- 本地存储路径
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_png_order ON png_receipts(order_no);
CREATE INDEX idx_png_merchant ON png_receipts(merchant_no);

-- ============================================================================
-- 完成提示
-- ============================================================================
-- 12 张表已创建完成：
-- 1. raw_files - 原始文件记录
-- 2. jy_transactions - 交易明细对账单
-- 3. js_settlements - 结算明细对账单
-- 4. jz_wallet_settlements - 钱包结算明细
-- 5. acc_account_settlements - 账户结算明细
-- 6. sep_transactions - 分账交易对账单
-- 7. sep_summaries - 分账交易汇总
-- 8. dw_withdrawals - 账户提现对账单
-- 9. dw_refunds - 提现退单
-- 10. d0_withdrawals - D0 提现
-- 11. jy_installments - 分期交易
-- 12. png_receipts - 电子签购单
