-- CreateTable
CREATE TABLE "branch_configs" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "is_open" BOOLEAN NOT NULL DEFAULT true,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "branch_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "branch_configs_branch_id_key" ON "branch_configs"("branch_id");

-- AddForeignKey
ALTER TABLE "branch_configs" ADD CONSTRAINT "branch_configs_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_configs" ADD CONSTRAINT "branch_configs_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- DB-11: las sucursales existentes conservan el comportamiento actual, que acepta pedidos.
INSERT INTO "branch_configs" ("id", "branch_id")
SELECT gen_random_uuid(), "id" FROM "branches";
