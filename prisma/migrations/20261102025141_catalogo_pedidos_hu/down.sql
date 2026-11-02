-- Generado con prisma migrate diff --script; CHECK y protecciones completados a mano.
BEGIN;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM "dishes") THEN
        RAISE EXCEPTION 'Vaciar o respaldar y retirar platillos antes de revertir su sucursal';
    END IF;
    IF EXISTS (SELECT 1 FROM "orders" WHERE "status"::text = 'PENDING_PAYMENT')
       OR EXISTS (SELECT 1 FROM "order_status_history"
                  WHERE "previous_status"::text = 'PENDING_PAYMENT'
                     OR "new_status"::text = 'PENDING_PAYMENT') THEN
        RAISE EXCEPTION 'Hay estados PENDING_PAYMENT en uso';
    END IF;
END $$;
ALTER TABLE "dishes" DROP CONSTRAINT "dishes_price_check";
ALTER TABLE "order_items" DROP CONSTRAINT "order_items_quantity_check";

-- AlterEnum
CREATE TYPE "order_status_new" AS ENUM ('PENDING', 'CONFIRMED', 'IN_PREPARATION', 'READY', 'DELIVERED', 'CANCELED');
ALTER TABLE "orders" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "orders" ALTER COLUMN "status" TYPE "order_status_new" USING ("status"::text::"order_status_new");
ALTER TABLE "order_status_history" ALTER COLUMN "previous_status" TYPE "order_status_new" USING ("previous_status"::text::"order_status_new");
ALTER TABLE "order_status_history" ALTER COLUMN "new_status" TYPE "order_status_new" USING ("new_status"::text::"order_status_new");
ALTER TYPE "order_status" RENAME TO "order_status_old";
ALTER TYPE "order_status_new" RENAME TO "order_status";
DROP TYPE "order_status_old";
ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'PENDING';
-- DropForeignKey
ALTER TABLE "dishes" DROP CONSTRAINT "dishes_branch_id_fkey";

-- DropIndex
DROP INDEX "dishes_branch_id_name_key";

-- AlterTable
ALTER TABLE "dishes" DROP COLUMN "branch_id",
ALTER COLUMN "name" SET DATA TYPE VARCHAR(150),
ALTER COLUMN "description" SET DATA TYPE TEXT,
ALTER COLUMN "price" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "order_items" ALTER COLUMN "unit_price" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "note" SET DATA TYPE TEXT;
COMMIT;
