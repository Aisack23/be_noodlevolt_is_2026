/*
  Warnings:

  - You are about to drop the column `branch_id` on the `ingredients` table. All the data in the column will be lost.
  - You are about to drop the column `current_stock` on the `ingredients` table. All the data in the column will be lost.
  - You are about to drop the column `minimum_stock` on the `ingredients` table. All the data in the column will be lost.
  - You are about to drop the column `ingredient_id` on the `inventory_movements` table. All the data in the column will be lost.
  - You are about to drop the column `cash_tendered` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `change_amount` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `payment_reference` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `payment_status` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `ingredient_id` on the `purchase_details` table. All the data in the column will be lost.
  - Added the required column `branch_ingredient_id` to the `inventory_movements` table without a default value. This is not possible if the table is not empty.
  - Added the required column `paymentMethod` to the `payments` table without a default value. This is not possible if the table is not empty.
  - Added the required column `branch_ingredient_id` to the `purchase_details` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "ingredients" DROP CONSTRAINT "ingredients_branch_id_fkey";

-- DropForeignKey
ALTER TABLE "inventory_movements" DROP CONSTRAINT "inventory_movements_ingredient_id_fkey";

-- DropForeignKey
ALTER TABLE "purchase_details" DROP CONSTRAINT "purchase_details_ingredient_id_fkey";

-- DropIndex
DROP INDEX "ingredients_branch_id_current_stock_idx";

-- DropIndex
DROP INDEX "ingredients_branch_id_name_key";

-- DropIndex
DROP INDEX "inventory_movements_ingredient_id_created_at_idx";

-- DropIndex
DROP INDEX "purchase_details_ingredient_id_idx";

-- AlterTable
ALTER TABLE "ingredients" DROP COLUMN "branch_id",
DROP COLUMN "current_stock",
DROP COLUMN "minimum_stock";

-- AlterTable
ALTER TABLE "inventory_movements" DROP COLUMN "ingredient_id",
ADD COLUMN     "branch_ingredient_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "orders" DROP COLUMN "cash_tendered",
DROP COLUMN "change_amount",
DROP COLUMN "payment_reference",
DROP COLUMN "payment_status";

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "cash_tendered" DECIMAL(12,2),
ADD COLUMN     "change_amount" DECIMAL(12,2),
ADD COLUMN     "paymentMethod" "payment_method" NOT NULL,
ADD COLUMN     "payment_reference" VARCHAR(150);

-- AlterTable
ALTER TABLE "purchase_details" DROP COLUMN "ingredient_id",
ADD COLUMN     "branch_ingredient_id" UUID NOT NULL;

-- CreateTable
CREATE TABLE "branch_ingredients" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "ingredient_id" UUID NOT NULL,
    "current_stock" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "minimum_stock" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "branch_ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "branch_ingredients_branch_id_current_stock_idx" ON "branch_ingredients"("branch_id", "current_stock");

-- CreateIndex
CREATE UNIQUE INDEX "branch_ingredients_branch_id_ingredient_id_key" ON "branch_ingredients"("branch_id", "ingredient_id");

-- CreateIndex
CREATE INDEX "inventory_movements_branch_ingredient_id_created_at_idx" ON "inventory_movements"("branch_ingredient_id", "created_at");

-- CreateIndex
CREATE INDEX "purchase_details_branch_ingredient_id_idx" ON "purchase_details"("branch_ingredient_id");

-- AddForeignKey
ALTER TABLE "branch_ingredients" ADD CONSTRAINT "branch_ingredients_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_ingredients" ADD CONSTRAINT "branch_ingredients_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_details" ADD CONSTRAINT "purchase_details_branch_ingredient_id_fkey" FOREIGN KEY ("branch_ingredient_id") REFERENCES "branch_ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_branch_ingredient_id_fkey" FOREIGN KEY ("branch_ingredient_id") REFERENCES "branch_ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
