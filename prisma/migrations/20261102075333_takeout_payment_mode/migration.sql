-- CreateEnum
CREATE TYPE "payment_mode" AS ENUM ('ONLINE', 'AT_COUNTER');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "payment_mode" "payment_mode";

-- La modalidad es obligatoria solo para LLEVAR; comparar el tipo como texto evita
-- acoplar este CHECK a futuras reconstrucciones del enum order_type.
ALTER TABLE "orders" ADD CONSTRAINT "orders_type_payment_mode_check"
CHECK (
  ("type"::text <> 'TAKEOUT' OR "payment_mode" IS NOT NULL)
  AND ("type"::text <> 'DINE_IN' OR "payment_mode" IS NULL)
);
