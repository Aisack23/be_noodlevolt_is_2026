BEGIN;

-- Los CHECK se añadieron manualmente a la migración de Prisma.
ALTER TABLE "branch_ingredients" DROP CONSTRAINT "branch_ingredients_minimum_stock_check";
ALTER TABLE "branch_ingredients" DROP CONSTRAINT "branch_ingredients_current_stock_check";

-- DropForeignKey
ALTER TABLE "branch_ingredients" DROP CONSTRAINT "branch_ingredients_branch_id_fkey";

-- DropIndex
DROP INDEX "ingredients_name_key";

-- AlterTable
ALTER TABLE "branch_ingredients" DROP COLUMN "created_at",
DROP COLUMN "updated_at";

-- AddForeignKey
ALTER TABLE "branch_ingredients" ADD CONSTRAINT "branch_ingredients_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
