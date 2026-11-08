CREATE UNIQUE INDEX "payments_order_id_key" ON "payments"("order_id");
DROP TABLE "simple_receipts";
ALTER TABLE "payments"
  DROP CONSTRAINT "payments_last4_format",
  DROP COLUMN "last4",
  DROP COLUMN "rejection_reason",
  ALTER COLUMN "subtotal" TYPE DECIMAL(12,2),
  ALTER COLUMN "total_paid" TYPE DECIMAL(12,2);
DROP INDEX "payments_order_id_created_at_idx";
DROP INDEX "payments_one_approved_order";
