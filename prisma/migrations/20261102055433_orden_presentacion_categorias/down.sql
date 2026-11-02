-- Generado con prisma migrate diff --script. Retirar la columna pierde su orden configurado.
BEGIN;
-- AlterTable
ALTER TABLE "categories" DROP COLUMN "display_order";
COMMIT;
