/*
  Warnings:

  - Added the required column `last_name` to the `users` table without a default value. This is not possible if the table is not empty.
  - Added the required column `name` to the `users` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('CLIENT', 'WAITER', 'COOK', 'BRANCH_ADMIN', 'GENERAL_MANAGER', 'CASHIER');

-- CreateEnum
CREATE TYPE "table_status" AS ENUM ('AVAILABLE', 'OCCUPIED', 'RESERVED', 'OUT_OF_SERVICE');

-- CreateEnum
CREATE TYPE "dish_status" AS ENUM ('AVAILABLE', 'SOLD_OUT', 'DISABLED');

-- CreateEnum
CREATE TYPE "account_status" AS ENUM ('OPEN', 'CLOSED', 'CANCELED');

-- CreateEnum
CREATE TYPE "order_status" AS ENUM ('PENDING', 'CONFIRMED', 'IN_PREPARATION', 'READY', 'DELIVERED', 'CANCELED');

-- CreateEnum
CREATE TYPE "payment_status" AS ENUM ('PENDING', 'PAID', 'REJECTED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "payment_method" AS ENUM ('CASH', 'CARD', 'BANK_TRANSFER', 'DIGITAL_WALLET', 'OTHER');

-- CreateEnum
CREATE TYPE "order_type" AS ENUM ('DINE_IN', 'TAKEOUT', 'DELIVERY');

-- CreateEnum
CREATE TYPE "order_item_status" AS ENUM ('PENDING', 'IN_PREPARATION', 'READY', 'DELIVERED', 'CANCELED');

-- CreateEnum
CREATE TYPE "reservation_status" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELED', 'COMPLETED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "inventory_movement_type" AS ENUM ('PURCHASE', 'CONSUMPTION', 'STOCK_IN', 'STOCK_OUT');

-- CreateEnum
CREATE TYPE "redemption_status" AS ENUM ('PENDING', 'USED', 'CANCELED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "points_movement_type" AS ENUM ('EARN', 'REDEEM', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "fiscal_document_type" AS ENUM ('INVOICE', 'TAX_CREDIT', 'RECEIPT', 'OTHER');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "branch_id" UUID,
ADD COLUMN     "last_name" TEXT NOT NULL,
ADD COLUMN     "name" TEXT NOT NULL,
ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'CLIENT';

-- CreateTable
CREATE TABLE "branches" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "address" VARCHAR(250) NOT NULL,
    "time_zone" VARCHAR(60) NOT NULL DEFAULT 'America/El_Salvador',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tables" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "number" VARCHAR(20) NOT NULL,
    "capacity" INTEGER NOT NULL,
    "status" "table_status" NOT NULL DEFAULT 'AVAILABLE',

    CONSTRAINT "tables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dishes" (
    "id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "description" TEXT,
    "price" DECIMAL(12,2) NOT NULL,
    "image_url" TEXT,
    "status" "dish_status" NOT NULL DEFAULT 'AVAILABLE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dishes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "table_id" UUID,
    "customer_id" UUID,
    "status" "account_status" NOT NULL DEFAULT 'OPEN',
    "opened_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ(6),

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "account_id" UUID,
    "customer_id" UUID,
    "waiter_id" UUID,
    "order_number" VARCHAR(30),
    "type" "order_type" NOT NULL,
    "recipient_name" TEXT,
    "recipient_phone" TEXT,
    "delivery_address" TEXT,
    "delivery_reference" TEXT,
    "delivery_instructions" TEXT,
    "status" "order_status" NOT NULL DEFAULT 'PENDING',
    "operation_id" UUID NOT NULL,
    "pickup_at" TIMESTAMPTZ(6),
    "payment_status" "payment_status" NOT NULL DEFAULT 'PENDING',
    "cash_tendered" DECIMAL(12,2),
    "change_amount" DECIMAL(12,2),
    "payment_reference" VARCHAR(150),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "dish_id" UUID NOT NULL,
    "dish_name" VARCHAR(150) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "note" TEXT,
    "status" "order_item_status" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_status_history" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "user_id" UUID,
    "previous_status" "order_status",
    "new_status" "order_status" NOT NULL,
    "note" TEXT,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservations" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "table_id" UUID NOT NULL,
    "customer_id" UUID,
    "contact_name" VARCHAR(120) NOT NULL,
    "phone" VARCHAR(30) NOT NULL,
    "guests" INTEGER NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "status" "reservation_status" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingredients" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "unit" VARCHAR(30) NOT NULL,
    "current_stock" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "minimum_stock" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipes" (
    "dish_id" UUID NOT NULL,
    "ingredient_id" UUID NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,

    CONSTRAINT "recipes_pkey" PRIMARY KEY ("dish_id","ingredient_id")
);

-- CreateTable
CREATE TABLE "purchases" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "supplier" VARCHAR(180) NOT NULL,
    "purchased_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "invoice_number" VARCHAR(80),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_details" (
    "id" UUID NOT NULL,
    "purchase_id" UUID NOT NULL,
    "ingredient_id" UUID NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit_cost" DECIMAL(12,4) NOT NULL,
    "expiration_date" DATE,

    CONSTRAINT "purchase_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_movements" (
    "id" UUID NOT NULL,
    "ingredient_id" UUID NOT NULL,
    "type" "inventory_movement_type" NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "previous_stock" DECIMAL(14,3) NOT NULL,
    "resulting_stock" DECIMAL(14,3) NOT NULL,
    "purchase_id" UUID,
    "order_id" UUID,
    "user_id" UUID,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_clients" (
    "id" UUID NOT NULL,
    "taxpayer_name" VARCHAR(180) NOT NULL,
    "dui_nit" VARCHAR(30) NOT NULL,
    "nrc" VARCHAR(30),
    "address" VARCHAR(250),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fiscal_clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "account_id" UUID,
    "order_id" UUID,
    "fiscal_client_id" UUID,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "status" "payment_status" NOT NULL DEFAULT 'PENDING',
    "tip" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_paid" DECIMAL(12,2) NOT NULL,
    "receipt_number" VARCHAR(80),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_details" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "method" "payment_method" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reference" VARCHAR(150),

    CONSTRAINT "payment_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_documents" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "document_type" "fiscal_document_type" NOT NULL,
    "document_number" VARCHAR(100) NOT NULL,
    "fiscal_client_id" UUID,
    "issued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuer_data" JSONB,
    "receiver_data" JSONB,

    CONSTRAINT "fiscal_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "points_rules" (
    "id" UUID NOT NULL,
    "points_per_dollar" DECIMAL(10,2) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "starts_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ends_at" TIMESTAMPTZ(6),

    CONSTRAINT "points_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "benefits" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "points_cost" INTEGER NOT NULL,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "benefits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "redemptions" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "benefit_id" UUID NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "points_cost" INTEGER NOT NULL,
    "status" "redemption_status" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "used_at" TIMESTAMPTZ(6),

    CONSTRAINT "redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "points_movements" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "points_rule_id" UUID,
    "type" "points_movement_type" NOT NULL,
    "points" INTEGER NOT NULL,
    "payment_id" UUID,
    "redemption_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "points_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" VARCHAR(40) NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "message" TEXT NOT NULL,
    "reference_type" VARCHAR(40),
    "reference_id" UUID,
    "event_key" VARCHAR(100),
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tables_branch_id_status_idx" ON "tables"("branch_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "tables_branch_id_number_key" ON "tables"("branch_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- CreateIndex
CREATE INDEX "accounts_branch_id_status_idx" ON "accounts"("branch_id", "status");

-- CreateIndex
CREATE INDEX "accounts_table_id_status_idx" ON "accounts"("table_id", "status");

-- CreateIndex
CREATE INDEX "accounts_customer_id_idx" ON "accounts"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_operation_id_key" ON "orders"("operation_id");

-- CreateIndex
CREATE INDEX "orders_branch_id_status_created_at_idx" ON "orders"("branch_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "orders_customer_id_created_at_idx" ON "orders"("customer_id", "created_at");

-- CreateIndex
CREATE INDEX "orders_account_id_idx" ON "orders"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_branch_id_order_number_key" ON "orders"("branch_id", "order_number");

-- CreateIndex
CREATE INDEX "order_items_order_id_status_idx" ON "order_items"("order_id", "status");

-- CreateIndex
CREATE INDEX "order_items_dish_id_idx" ON "order_items"("dish_id");

-- CreateIndex
CREATE INDEX "order_status_history_order_id_changed_at_idx" ON "order_status_history"("order_id", "changed_at");

-- CreateIndex
CREATE INDEX "reservations_table_id_starts_at_idx" ON "reservations"("table_id", "starts_at");

-- CreateIndex
CREATE INDEX "reservations_branch_id_starts_at_idx" ON "reservations"("branch_id", "starts_at");

-- CreateIndex
CREATE INDEX "reservations_customer_id_starts_at_idx" ON "reservations"("customer_id", "starts_at");

-- CreateIndex
CREATE INDEX "ingredients_branch_id_current_stock_idx" ON "ingredients"("branch_id", "current_stock");

-- CreateIndex
CREATE UNIQUE INDEX "ingredients_branch_id_name_key" ON "ingredients"("branch_id", "name");

-- CreateIndex
CREATE INDEX "recipes_ingredient_id_idx" ON "recipes"("ingredient_id");

-- CreateIndex
CREATE INDEX "purchases_branch_id_purchased_at_idx" ON "purchases"("branch_id", "purchased_at");

-- CreateIndex
CREATE UNIQUE INDEX "purchases_branch_id_invoice_number_key" ON "purchases"("branch_id", "invoice_number");

-- CreateIndex
CREATE INDEX "purchase_details_purchase_id_idx" ON "purchase_details"("purchase_id");

-- CreateIndex
CREATE INDEX "purchase_details_ingredient_id_idx" ON "purchase_details"("ingredient_id");

-- CreateIndex
CREATE INDEX "inventory_movements_ingredient_id_created_at_idx" ON "inventory_movements"("ingredient_id", "created_at");

-- CreateIndex
CREATE INDEX "inventory_movements_order_id_idx" ON "inventory_movements"("order_id");

-- CreateIndex
CREATE INDEX "inventory_movements_purchase_id_idx" ON "inventory_movements"("purchase_id");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_clients_dui_nit_key" ON "fiscal_clients"("dui_nit");

-- CreateIndex
CREATE UNIQUE INDEX "payments_account_id_key" ON "payments"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_order_id_key" ON "payments"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_receipt_number_key" ON "payments"("receipt_number");

-- CreateIndex
CREATE INDEX "payments_branch_id_created_at_idx" ON "payments"("branch_id", "created_at");

-- CreateIndex
CREATE INDEX "payments_fiscal_client_id_idx" ON "payments"("fiscal_client_id");

-- CreateIndex
CREATE INDEX "payment_details_payment_id_idx" ON "payment_details"("payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_documents_payment_id_key" ON "fiscal_documents"("payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_documents_document_number_key" ON "fiscal_documents"("document_number");

-- CreateIndex
CREATE INDEX "points_rules_is_active_starts_at_ends_at_idx" ON "points_rules"("is_active", "starts_at", "ends_at");

-- CreateIndex
CREATE INDEX "benefits_is_active_idx" ON "benefits"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "redemptions_code_key" ON "redemptions"("code");

-- CreateIndex
CREATE INDEX "redemptions_customer_id_created_at_idx" ON "redemptions"("customer_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "points_movements_redemption_id_key" ON "points_movements"("redemption_id");

-- CreateIndex
CREATE INDEX "points_movements_customer_id_created_at_idx" ON "points_movements"("customer_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_order_id_key" ON "reviews"("order_id");

-- CreateIndex
CREATE INDEX "reviews_branch_id_created_at_idx" ON "reviews"("branch_id", "created_at");

-- CreateIndex
CREATE INDEX "reviews_customer_id_created_at_idx" ON "reviews"("customer_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_is_read_created_at_idx" ON "notifications"("user_id", "is_read", "created_at");

-- CreateIndex
CREATE INDEX "notifications_reference_type_reference_id_idx" ON "notifications"("reference_type", "reference_id");

-- CreateIndex
CREATE INDEX "users_branch_id_idx" ON "users"("branch_id");

-- CreateIndex
CREATE INDEX "users_role_is_active_idx" ON "users"("role", "is_active");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tables" ADD CONSTRAINT "tables_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dishes" ADD CONSTRAINT "dishes_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "tables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_waiter_id_fkey" FOREIGN KEY ("waiter_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_dish_id_fkey" FOREIGN KEY ("dish_id") REFERENCES "dishes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "tables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_dish_id_fkey" FOREIGN KEY ("dish_id") REFERENCES "dishes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_details" ADD CONSTRAINT "purchase_details_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_details" ADD CONSTRAINT "purchase_details_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_fiscal_client_id_fkey" FOREIGN KEY ("fiscal_client_id") REFERENCES "fiscal_clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_details" ADD CONSTRAINT "payment_details_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_documents" ADD CONSTRAINT "fiscal_documents_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_documents" ADD CONSTRAINT "fiscal_documents_fiscal_client_id_fkey" FOREIGN KEY ("fiscal_client_id") REFERENCES "fiscal_clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_benefit_id_fkey" FOREIGN KEY ("benefit_id") REFERENCES "benefits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "points_movements" ADD CONSTRAINT "points_movements_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "points_movements" ADD CONSTRAINT "points_movements_points_rule_id_fkey" FOREIGN KEY ("points_rule_id") REFERENCES "points_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "points_movements" ADD CONSTRAINT "points_movements_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "points_movements" ADD CONSTRAINT "points_movements_redemption_id_fkey" FOREIGN KEY ("redemption_id") REFERENCES "redemptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
