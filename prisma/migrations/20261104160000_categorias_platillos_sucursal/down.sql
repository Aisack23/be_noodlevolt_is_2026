-- Generado con prisma migrate diff --script; la protección de datos se completó a mano.
BEGIN;
DO $$
BEGIN
    -- Unir categorías por sucursal en una global perdería sus diferencias. Los
    -- platillos dependen de una categoría, así que basta con revisar categories.
    IF EXISTS (SELECT 1 FROM "categories") THEN
        RAISE EXCEPTION 'Vaciar o respaldar y retirar categorías y platillos antes de revertir las categorías por sucursal';
    END IF;
END $$;

-- DropForeignKey
ALTER TABLE "categories" DROP CONSTRAINT "categories_branch_id_fkey";

-- DropForeignKey
ALTER TABLE "dishes" DROP CONSTRAINT "dishes_branch_id_category_id_fkey";

-- DropIndex
DROP INDEX "categories_branch_id_id_key";

-- DropIndex
DROP INDEX "categories_branch_id_name_key";

-- DropIndex
DROP INDEX "dishes_branch_id_category_id_idx";

-- AlterTable
ALTER TABLE "categories" DROP COLUMN "branch_id",
DROP COLUMN "created_at",
DROP COLUMN "updated_at";

-- AlterTable
ALTER TABLE "dishes" DROP COLUMN "is_available",
DROP COLUMN "is_deleted",
DROP COLUMN "updated_at",
ALTER COLUMN "price" SET DATA TYPE DECIMAL(8,2);

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- AddForeignKey
ALTER TABLE "dishes" ADD CONSTRAINT "dishes_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
COMMIT;
