ALTER TABLE "order_items" ALTER COLUMN "unit_price" TYPE DECIMAL(8,2);
ALTER TABLE "orders" DROP CONSTRAINT "orders_total_nonnegative", DROP COLUMN "request_hash", DROP COLUMN "total";
