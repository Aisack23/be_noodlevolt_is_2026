ALTER TABLE "orders"
  ADD COLUMN "total" DECIMAL(14,2),
  ADD COLUMN "request_hash" VARCHAR(64),
  ADD CONSTRAINT "orders_total_nonnegative" CHECK ("total" IS NULL OR "total" >= 0);
ALTER TABLE "order_items" ALTER COLUMN "unit_price" TYPE DECIMAL(10,2);
