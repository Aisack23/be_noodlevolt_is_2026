/*
  Warnings:

  - A unique constraint covering the columns `[name]` on the table `branches` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'INVENTORY_MANAGER';

-- AlterEnum
ALTER TYPE "table_status" ADD VALUE 'NEEDS_CLEANING';

-- CreateIndex
CREATE UNIQUE INDEX "branches_name_key" ON "branches"("name");

-- DB-A.1.1: CHECK manuales; la comparación textual evita depender del enum.
ALTER TABLE "users" ADD CONSTRAINT "users_role_branch_check" CHECK (
    ("role"::text IN ('CLIENT', 'GENERAL_MANAGER') AND "branch_id" IS NULL)
    OR ("role"::text NOT IN ('CLIENT', 'GENERAL_MANAGER') AND "branch_id" IS NOT NULL)
);
ALTER TABLE "tables" ADD CONSTRAINT "tables_capacity_check" CHECK ("capacity" > 0);
