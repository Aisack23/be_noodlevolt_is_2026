/*
  DB-01: categorías por sucursal y campos de disponibilidad de platillos.

  Conserva los datos existentes: cada categoría se copia a cada sucursal y cada
  platillo pasa a la copia de su propia sucursal. Dishes.status se mantiene y
  el CHECK dishes_price_check no cambia: el documento de HU no fija un máximo.
*/
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM "categories") AND NOT EXISTS (SELECT 1 FROM "branches") THEN
        RAISE EXCEPTION 'Hay categorías pero ninguna sucursal a la cual copiarlas';
    END IF;
END $$;

-- DropForeignKey
ALTER TABLE "dishes" DROP CONSTRAINT "dishes_category_id_fkey";

-- DropIndex
DROP INDEX "categories_name_key";

-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "branch_id" UUID,
ADD COLUMN     "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "source_category_id" UUID;

-- AlterTable
ALTER TABLE "dishes" ADD COLUMN     "is_available" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "is_deleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "price" SET DATA TYPE DECIMAL(10,2);

-- Copia manual de datos: Prisma no puede deducir la sucursal de una categoría global.
INSERT INTO "categories" ("id", "branch_id", "name", "display_order", "description", "is_active", "source_category_id")
SELECT gen_random_uuid(), b."id", c."name", c."display_order", c."description", c."is_active", c."id"
FROM "categories" c
CROSS JOIN "branches" b;

UPDATE "dishes" d
SET "category_id" = copy."id"
FROM "categories" copy
WHERE copy."source_category_id" = d."category_id"
  AND copy."branch_id" = d."branch_id";

DELETE FROM "categories" WHERE "branch_id" IS NULL;

ALTER TABLE "categories" DROP COLUMN "source_category_id",
ALTER COLUMN "branch_id" SET NOT NULL;

-- SOLD_OUT y DISABLED dejan de estar disponibles; ninguno se considera eliminado.
UPDATE "dishes" SET "is_available" = false WHERE "status" <> 'AVAILABLE';

-- CreateIndex
CREATE UNIQUE INDEX "categories_branch_id_name_key" ON "categories"("branch_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "categories_branch_id_id_key" ON "categories"("branch_id", "id");

-- CreateIndex
CREATE INDEX "dishes_branch_id_category_id_idx" ON "dishes"("branch_id", "category_id");

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dishes" ADD CONSTRAINT "dishes_branch_id_category_id_fkey" FOREIGN KEY ("branch_id", "category_id") REFERENCES "categories"("branch_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
