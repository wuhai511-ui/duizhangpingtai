-- CreateTable
CREATE TABLE "Merchant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "merchant_no" TEXT NOT NULL,
    "name" TEXT,
    "status" INTEGER NOT NULL DEFAULT 1,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "JyTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "merchant_id" TEXT NOT NULL,
    "trans_date" TEXT NOT NULL,
    "trans_time" TEXT NOT NULL,
    "terminal_no" TEXT,
    "branch_name" TEXT,
    "trans_type" TEXT,
    "lakala_serial" TEXT NOT NULL,
    "orig_lakala_serial" TEXT,
    "card_no" TEXT,
    "pay_channel" TEXT,
    "bank_name" TEXT,
    "amount" BIGINT NOT NULL,
    "fee" BIGINT NOT NULL,
    "settle_amount" BIGINT NOT NULL,
    "merchant_order_no" TEXT,
    "pay_order_no" TEXT,
    "external_serial" TEXT,
    "sys_ref_no" TEXT,
    "remark" TEXT,
    "pay_method" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JyTransaction_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "Merchant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "JsSettlement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "merchant_id" TEXT NOT NULL,
    "trans_date" TEXT NOT NULL,
    "trans_time" TEXT,
    "terminal_no" TEXT,
    "lakala_serial" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "fee" BIGINT NOT NULL,
    "settle_amount" BIGINT NOT NULL,
    "settle_date" TEXT NOT NULL,
    "settle_status" INTEGER NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JsSettlement_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "Merchant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "JzWalletSettlement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "merchant_id" TEXT NOT NULL,
    "settle_date" TEXT NOT NULL,
    "wallet_type" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "fee" BIGINT NOT NULL,
    "settle_amount" BIGINT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JzWalletSettlement_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "Merchant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AccAccountSettlement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "merchant_id" TEXT NOT NULL,
    "account_no" TEXT NOT NULL,
    "settle_date" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "fee" BIGINT NOT NULL,
    "settle_amount" BIGINT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AccAccountSettlement_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "Merchant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SepTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "merchant_id" TEXT NOT NULL,
    "trans_date" TEXT NOT NULL,
    "lakala_serial" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "sep_amount" BIGINT NOT NULL,
    "sep_rate" INTEGER NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SepTransaction_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "Merchant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SepSummary" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "merchant_id" TEXT NOT NULL,
    "settle_date" TEXT NOT NULL,
    "total_amount" BIGINT NOT NULL,
    "total_sep" BIGINT NOT NULL,
    "trans_count" INTEGER NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SepSummary_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "Merchant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DwWithdrawal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "merchant_id" TEXT NOT NULL,
    "withdraw_date" TEXT NOT NULL,
    "withdraw_serial" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "fee" BIGINT NOT NULL,
    "status" INTEGER NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DwWithdrawal_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "Merchant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "D0Withdrawal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "merchant_id" TEXT NOT NULL,
    "trans_date" TEXT NOT NULL,
    "lakala_serial" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "fee" BIGINT NOT NULL,
    "d0_fee" BIGINT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "D0Withdrawal_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "Merchant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "JyInstallment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "merchant_id" TEXT NOT NULL,
    "trans_date" TEXT NOT NULL,
    "lakala_serial" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "installment_count" INTEGER NOT NULL,
    "per_amount" BIGINT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JyInstallment_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "Merchant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReconciliationBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "batch_no" TEXT NOT NULL,
    "check_date" TEXT NOT NULL,
    "file_type" TEXT NOT NULL,
    "file_name" TEXT,
    "record_count" INTEGER NOT NULL,
    "total_amount" BIGINT NOT NULL,
    "match_count" INTEGER NOT NULL DEFAULT 0,
    "mismatch_count" INTEGER NOT NULL DEFAULT 0,
    "missing_count" INTEGER NOT NULL DEFAULT 0,
    "status" INTEGER NOT NULL DEFAULT 0,
    "error_msg" TEXT,
    "started_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" DATETIME
);

-- CreateIndex
CREATE UNIQUE INDEX "Merchant_merchant_no_key" ON "Merchant"("merchant_no");

-- CreateIndex
CREATE INDEX "Merchant_merchant_no_idx" ON "Merchant"("merchant_no");

-- CreateIndex
CREATE INDEX "JyTransaction_merchant_id_trans_date_idx" ON "JyTransaction"("merchant_id", "trans_date");

-- CreateIndex
CREATE INDEX "JyTransaction_trans_date_idx" ON "JyTransaction"("trans_date");

-- CreateIndex
CREATE UNIQUE INDEX "JyTransaction_merchant_id_merchant_order_no_key" ON "JyTransaction"("merchant_id", "merchant_order_no");

-- CreateIndex
CREATE INDEX "JsSettlement_settle_date_idx" ON "JsSettlement"("settle_date");

-- CreateIndex
CREATE UNIQUE INDEX "JsSettlement_merchant_id_lakala_serial_settle_date_key" ON "JsSettlement"("merchant_id", "lakala_serial", "settle_date");

-- CreateIndex
CREATE INDEX "JzWalletSettlement_settle_date_idx" ON "JzWalletSettlement"("settle_date");

-- CreateIndex
CREATE UNIQUE INDEX "JzWalletSettlement_merchant_id_settle_date_wallet_type_key" ON "JzWalletSettlement"("merchant_id", "settle_date", "wallet_type");

-- CreateIndex
CREATE INDEX "AccAccountSettlement_settle_date_idx" ON "AccAccountSettlement"("settle_date");

-- CreateIndex
CREATE UNIQUE INDEX "AccAccountSettlement_merchant_id_account_no_settle_date_key" ON "AccAccountSettlement"("merchant_id", "account_no", "settle_date");

-- CreateIndex
CREATE INDEX "SepTransaction_trans_date_idx" ON "SepTransaction"("trans_date");

-- CreateIndex
CREATE UNIQUE INDEX "SepTransaction_merchant_id_lakala_serial_key" ON "SepTransaction"("merchant_id", "lakala_serial");

-- CreateIndex
CREATE INDEX "SepSummary_settle_date_idx" ON "SepSummary"("settle_date");

-- CreateIndex
CREATE UNIQUE INDEX "SepSummary_merchant_id_settle_date_key" ON "SepSummary"("merchant_id", "settle_date");

-- CreateIndex
CREATE INDEX "DwWithdrawal_withdraw_date_idx" ON "DwWithdrawal"("withdraw_date");

-- CreateIndex
CREATE UNIQUE INDEX "DwWithdrawal_merchant_id_withdraw_serial_key" ON "DwWithdrawal"("merchant_id", "withdraw_serial");

-- CreateIndex
CREATE INDEX "D0Withdrawal_trans_date_idx" ON "D0Withdrawal"("trans_date");

-- CreateIndex
CREATE UNIQUE INDEX "D0Withdrawal_merchant_id_lakala_serial_key" ON "D0Withdrawal"("merchant_id", "lakala_serial");

-- CreateIndex
CREATE INDEX "JyInstallment_trans_date_idx" ON "JyInstallment"("trans_date");

-- CreateIndex
CREATE UNIQUE INDEX "JyInstallment_merchant_id_lakala_serial_key" ON "JyInstallment"("merchant_id", "lakala_serial");

-- CreateIndex
CREATE UNIQUE INDEX "ReconciliationBatch_batch_no_key" ON "ReconciliationBatch"("batch_no");

-- CreateIndex
CREATE INDEX "ReconciliationBatch_check_date_idx" ON "ReconciliationBatch"("check_date");

-- CreateIndex
CREATE INDEX "ReconciliationBatch_status_idx" ON "ReconciliationBatch"("status");
