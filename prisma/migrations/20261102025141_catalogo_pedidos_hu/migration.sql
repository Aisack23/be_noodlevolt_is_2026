/*
  Warnings:

  - You are about to alter the column `name` on the `dishes` table. The data in that column could be lost. The data in that column will be cast from `VarChar(150)` to `VarChar(100)`.
  - You are about to alter the column `description` on the `dishes` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(300)`.
  - You are about to alter the column `price` on the `dishes` table. The data in that column could be lost. The data in that column will be cast from `Decimal(12,2)` to `Decimal(8,2)`.
  - You are about to alter the column `unit_price` on the `order_items` table. The data in that column could be lost. The data in that column will be cast from `Decimal(12,2)` to `Decimal(8,2)`.
  - You are about to alter the column `note` on the `order_items` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(200)`.
  - A unique constraint covering the columns `[branch_id,name]` on the table `dishes` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `branch_id` to the `dishes` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
ALTER TYPE "order_status" ADD VALUE 'PENDING_PAYMENT';

-- AlterTable
ALTER TABLE "dishes" ADD COLUMN     "branch_id" UUID NOT NULL,
ALTER COLUMN "name" SET DATA TYPE VARCHAR(100),
ALTER COLUMN "description" SET DATA TYPE VARCHAR(300),
ALTER COLUMN "price" SET DATA TYPE DECIMAL(8,2);

-- AlterTable
ALTER TABLE "order_items" ALTER COLUMN "unit_price" SET DATA TYPE DECIMAL(8,2),
ALTER COLUMN "note" SET DATA TYPE VARCHAR(200);

-- CreateIndex
CREATE UNIQUE INDEX "dishes_branch_id_name_key" ON "dishes"("branch_id", "name");

-- AddForeignKey
ALTER TABLE "dishes" ADD CONSTRAINT "dishes_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DB-1.1.1 y DB-2.1.1: CHECK manuales no representados por Prisma.
ALTER TABLE "dishes" ADD CONSTRAINT "dishes_price_check" CHECK ("price" > 0);
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_quantity_check" CHECK ("quantity" BETWEEN 1 AND 20);
