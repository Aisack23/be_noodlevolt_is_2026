BEGIN;

-- El CHECK se añadió manualmente a la migración de Prisma.
ALTER TABLE "orders" DROP CONSTRAINT "orders_type_payment_mode_check";

-- AlterTable
ALTER TABLE "orders" DROP COLUMN "payment_mode";

-- DropEnum
DROP TYPE "payment_mode";

COMMIT;
