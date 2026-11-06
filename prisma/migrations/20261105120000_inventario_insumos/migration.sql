-- DropForeignKey
ALTER TABLE "branch_ingredients" DROP CONSTRAINT "branch_ingredients_branch_id_fkey";

-- AlterTable
ALTER TABLE "branch_ingredients" ADD COLUMN     "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE UNIQUE INDEX "ingredients_name_key" ON "ingredients"("name");

-- AddForeignKey
ALTER TABLE "branch_ingredients" ADD CONSTRAINT "branch_ingredients_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Prisma no soporta CHECK: se agregan a mano. PostgreSQL ordena NaN por encima de
-- cualquier número, así que `>= 0` por sí solo lo aceptaría como cantidad válida.
ALTER TABLE "branch_ingredients" ADD CONSTRAINT "branch_ingredients_current_stock_check" CHECK ("current_stock" >= 0 AND "current_stock" <> 'NaN');
ALTER TABLE "branch_ingredients" ADD CONSTRAINT "branch_ingredients_minimum_stock_check" CHECK ("minimum_stock" >= 0 AND "minimum_stock" <> 'NaN');
