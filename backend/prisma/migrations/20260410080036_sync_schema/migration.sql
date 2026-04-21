/*
  Warnings:

  - You are about to drop the column `file_name` on the `ReconciliationBatch` table. All the data in the column will be lost.
  - You are about to drop the column `file_type` on the `ReconciliationBatch` table. All the data in the column will be lost.
  - You are about to drop the column `mismatch_count` on the `ReconciliationBatch` table. All the data in the column will be lost.
  - You are about to drop the column `missing_count` on the `ReconciliationBatch` table. All the data in the column will be lost.
  - Added the required column `batch_type` to the `ReconciliationBatch` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "BusinessOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "merchant_id" TEXT NOT NULL,
    "order_no" TEXT NOT NULL,
    "order_type" TEXT NOT NULL,
    "pay_method" TEXT NOT NULL,
    "channel_name" TEXT NOT NULL,
    "customer_phone" TEXT,
    "customer_name" TEXT,
    "order_amount" BIGINT NOT NULL,
    "received_amount" BIGINT NOT NULL,
    "paid_amount" BIGINT NOT NULL,
    "channel_fee" BIGINT NOT NULL,
    "order_status" TEXT NOT NULL,
    "pay_serial_no" TEXT,
    "orig_serial_no" TEXT,
    "trans_date" TEXT NOT NULL,
    "file_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BusinessOrder_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "Merchant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "merchant_id" TEXT NOT NULL,
    "file_id" TEXT NOT NULL,
    "invoice_no" TEXT,
    "invoice_code" TEXT,
    "buyer_name" TEXT,
    "buyer_tax_no" TEXT,
    "seller_name" TEXT,
    "seller_tax_no" TEXT,
    "amount" BIGINT NOT NULL,
    "tax_amount" BIGINT NOT NULL,
    "total_amount" BIGINT NOT NULL,
    "invoice_date" TEXT,
    "ocr_raw" TEXT,
    "status" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ReconciliationDetail" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "batch_id" TEXT NOT NULL,
    "serial_no" TEXT NOT NULL,
    "business_data" TEXT,
    "channel_data" TEXT,
    "result_type" TEXT NOT NULL,
    "business_amount" BIGINT,
    "channel_amount" BIGINT,
    "diff_amount" BIGINT,
    "match_date" TEXT,
    "remark" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReconciliationDetail_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "ReconciliationBatch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BillTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "field_config" TEXT NOT NULL,
    "delimiter" TEXT NOT NULL DEFAULT '|',
    "header_row" INTEGER NOT NULL DEFAULT 1,
    "data_start_row" INTEGER NOT NULL DEFAULT 2,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ReconciliationBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "batch_no" TEXT NOT NULL,
    "check_date" TEXT NOT NULL,
    "batch_type" TEXT NOT NULL,
    "business_file_id" TEXT,
    "channel_file_id" TEXT,
    "record_count" INTEGER NOT NULL,
    "total_amount" BIGINT NOT NULL,
    "match_count" INTEGER NOT NULL DEFAULT 0,
    "rolling_count" INTEGER NOT NULL DEFAULT 0,
    "long_count" INTEGER NOT NULL DEFAULT 0,
    "short_count" INTEGER NOT NULL DEFAULT 0,
    "amount_diff_count" INTEGER NOT NULL DEFAULT 0,
    "status" INTEGER NOT NULL DEFAULT 0,
    "error_msg" TEXT,
    "started_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" DATETIME
);
INSERT INTO "new_ReconciliationBatch" ("batch_no", "check_date", "error_msg", "finished_at", "id", "match_count", "record_count", "started_at", "status", "total_amount") SELECT "batch_no", "check_date", "error_msg", "finished_at", "id", "match_count", "record_count", "started_at", "status", "total_amount" FROM "ReconciliationBatch";
DROP TABLE "ReconciliationBatch";
ALTER TABLE "new_ReconciliationBatch" RENAME TO "ReconciliationBatch";
CREATE UNIQUE INDEX "ReconciliationBatch_batch_no_key" ON "ReconciliationBatch"("batch_no");
CREATE INDEX "ReconciliationBatch_check_date_idx" ON "ReconciliationBatch"("check_date");
CREATE INDEX "ReconciliationBatch_status_idx" ON "ReconciliationBatch"("status");
CREATE INDEX "ReconciliationBatch_batch_type_idx" ON "ReconciliationBatch"("batch_type");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "BusinessOrder_order_no_key" ON "BusinessOrder"("order_no");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessOrder_pay_serial_no_key" ON "BusinessOrder"("pay_serial_no");

-- CreateIndex
CREATE INDEX "BusinessOrder_trans_date_idx" ON "BusinessOrder"("trans_date");

-- CreateIndex
CREATE INDEX "BusinessOrder_pay_serial_no_idx" ON "BusinessOrder"("pay_serial_no");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_file_id_key" ON "Invoice"("file_id");

-- CreateIndex
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");

-- CreateIndex
CREATE INDEX "ReconciliationDetail_batch_id_idx" ON "ReconciliationDetail"("batch_id");

-- CreateIndex
CREATE INDEX "ReconciliationDetail_result_type_idx" ON "ReconciliationDetail"("result_type");

-- CreateIndex
CREATE INDEX "BillTemplate_type_idx" ON "BillTemplate"("type");

-- CreateIndex
CREATE INDEX "BillTemplate_is_default_idx" ON "BillTemplate"("is_default");
