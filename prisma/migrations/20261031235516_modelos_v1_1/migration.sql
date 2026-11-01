/*
  Warnings:

  - You are about to drop the column `cash_tendered` on the `payments` table. All the data in the column will be lost.
  - You are about to drop the column `change_amount` on the `payments` table. All the data in the column will be lost.
  - You are about to drop the column `paymentMethod` on the `payments` table. All the data in the column will be lost.
  - You are about to drop the column `payment_reference` on the `payments` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "payment_details" ADD COLUMN     "cash_tendered" DECIMAL(12,2),
ADD COLUMN     "change_amount" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "payments" DROP COLUMN "cash_tendered",
DROP COLUMN "change_amount",
DROP COLUMN "paymentMethod",
DROP COLUMN "payment_reference";
