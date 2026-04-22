-- SQLite replayable migration for reconciliation post-process and exception tickets

ALTER TABLE "ReconciliationDetail" ADD COLUMN "final_result_type" TEXT;
ALTER TABLE "ReconciliationDetail" ADD COLUMN "process_status" TEXT NOT NULL DEFAULT 'PENDING';
ALTER TABLE "ReconciliationDetail" ADD COLUMN "process_note" TEXT;

ALTER TABLE "ReconciliationBatch" ADD COLUMN "post_process_status" TEXT NOT NULL DEFAULT 'PENDING';
ALTER TABLE "ReconciliationBatch" ADD COLUMN "post_processed_at" DATETIME;

CREATE TABLE IF NOT EXISTS "exception_tickets" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "batch_id" TEXT NOT NULL,
  "detail_id" TEXT NOT NULL,
  "serial_no" TEXT NOT NULL,
  "exception_type" TEXT NOT NULL,
  "exception_data" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
  "resolution" TEXT,
  "resolution_note" TEXT,
  "assignee_id" TEXT,
  "resolved_by" TEXT,
  "resolved_at" DATETIME,
  "closed_at" DATETIME,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL,
  CONSTRAINT "exception_tickets_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "ReconciliationBatch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "exception_tickets_detail_id_fkey" FOREIGN KEY ("detail_id") REFERENCES "ReconciliationDetail" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "exception_tickets_detail_id_key" ON "exception_tickets"("detail_id");
CREATE INDEX IF NOT EXISTS "exception_tickets_batch_id_status_idx" ON "exception_tickets"("batch_id", "status");
CREATE INDEX IF NOT EXISTS "exception_tickets_batch_id_exception_type_idx" ON "exception_tickets"("batch_id", "exception_type");
CREATE INDEX IF NOT EXISTS "exception_tickets_status_created_at_idx" ON "exception_tickets"("status", "created_at");
CREATE INDEX IF NOT EXISTS "exception_tickets_assignee_id_idx" ON "exception_tickets"("assignee_id");

CREATE TABLE IF NOT EXISTS "recon_rules" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "rule_type" TEXT NOT NULL,
  "condition_expr" TEXT NOT NULL,
  "action_expr" TEXT NOT NULL,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "recon_rules_name_key" ON "recon_rules"("name");
CREATE INDEX IF NOT EXISTS "recon_rules_rule_type_enabled_idx" ON "recon_rules"("rule_type", "enabled");
CREATE INDEX IF NOT EXISTS "recon_rules_priority_idx" ON "recon_rules"("priority");

CREATE TABLE IF NOT EXISTS "recon_process_logs" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "batch_id" TEXT NOT NULL,
  "detail_id" TEXT,
  "ticket_id" TEXT,
  "action" TEXT NOT NULL,
  "action_data" TEXT NOT NULL,
  "rule_id" TEXT,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "recon_process_logs_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "ReconciliationBatch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "recon_process_logs_detail_id_fkey" FOREIGN KEY ("detail_id") REFERENCES "ReconciliationDetail" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "recon_process_logs_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "exception_tickets" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "recon_process_logs_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "recon_rules" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "recon_process_logs_batch_id_created_at_idx" ON "recon_process_logs"("batch_id", "created_at");
CREATE INDEX IF NOT EXISTS "recon_process_logs_detail_id_created_at_idx" ON "recon_process_logs"("detail_id", "created_at");
CREATE INDEX IF NOT EXISTS "recon_process_logs_ticket_id_created_at_idx" ON "recon_process_logs"("ticket_id", "created_at");

CREATE INDEX IF NOT EXISTS "reconciliation_details_process_status_idx" ON "ReconciliationDetail"("process_status");
CREATE INDEX IF NOT EXISTS "reconciliation_batches_post_process_status_idx" ON "ReconciliationBatch"("post_process_status");
