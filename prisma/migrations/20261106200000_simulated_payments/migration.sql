DROP INDEX "payments_order_id_key";
CREATE UNIQUE INDEX "payments_one_approved_order" ON "payments"("order_id") WHERE "status" = 'PAID';
CREATE INDEX "payments_order_id_created_at_idx" ON "payments"("order_id", "created_at");
ALTER TABLE "payments"
  ADD COLUMN "last4" VARCHAR(4),
  ADD COLUMN "rejection_reason" VARCHAR(160),
  ALTER COLUMN "subtotal" TYPE DECIMAL(14,2),
  ALTER COLUMN "total_paid" TYPE DECIMAL(14,2),
  ADD CONSTRAINT "payments_last4_format" CHECK ("last4" IS NULL OR "last4" ~ '^[0-9]{4}$');
CREATE TABLE "simple_receipts" (
  "id" UUID PRIMARY KEY,
  "payment_id" UUID NOT NULL UNIQUE REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "number" VARCHAR(80) NOT NULL UNIQUE,
  "amount" DECIMAL(14,2) NOT NULL CHECK ("amount" > 0),
  "issued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
