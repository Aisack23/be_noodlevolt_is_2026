-- Generado con prisma migrate diff --script; CHECK y protección completados a mano.
BEGIN;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM "users" WHERE "role"::text = 'INVENTORY_MANAGER')
       OR EXISTS (SELECT 1 FROM "tables" WHERE "status"::text = 'NEEDS_CLEANING') THEN
        RAISE EXCEPTION 'Hay roles o estados de mesa nuevos en uso';
    END IF;
END $$;
ALTER TABLE "users" DROP CONSTRAINT "users_role_branch_check";
ALTER TABLE "tables" DROP CONSTRAINT "tables_capacity_check";

-- AlterEnum
CREATE TYPE "UserRole_new" AS ENUM ('CLIENT', 'WAITER', 'COOK', 'BRANCH_ADMIN', 'GENERAL_MANAGER', 'CASHIER');
ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "users" ALTER COLUMN "role" TYPE "UserRole_new" USING ("role"::text::"UserRole_new");
ALTER TYPE "UserRole" RENAME TO "UserRole_old";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";
DROP TYPE "UserRole_old";
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'CLIENT';
-- AlterEnum
CREATE TYPE "table_status_new" AS ENUM ('AVAILABLE', 'OCCUPIED', 'RESERVED', 'OUT_OF_SERVICE');
ALTER TABLE "tables" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "tables" ALTER COLUMN "status" TYPE "table_status_new" USING ("status"::text::"table_status_new");
ALTER TYPE "table_status" RENAME TO "table_status_old";
ALTER TYPE "table_status_new" RENAME TO "table_status";
DROP TYPE "table_status_old";
ALTER TABLE "tables" ALTER COLUMN "status" SET DEFAULT 'AVAILABLE';
-- DropIndex
DROP INDEX "branches_name_key";
COMMIT;
