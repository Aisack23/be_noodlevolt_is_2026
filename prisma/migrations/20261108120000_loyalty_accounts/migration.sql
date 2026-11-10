BEGIN;

-- El backfill debe leer el mismo historial que valida el índice y el CHECK.
LOCK TABLE "points_movements" IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE "loyalty_accounts" (
    "user_id" UUID NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "loyalty_accounts_pkey" PRIMARY KEY ("user_id"),
    CONSTRAINT "loyalty_accounts_user_id_fkey" FOREIGN KEY ("user_id")
        REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    -- Prisma no representa este CHECK; el saldo disponible nunca es negativo.
    CONSTRAINT "loyalty_accounts_points_nonnegative" CHECK ("points" >= 0)
);

-- Se preservan los canjes y ajustes con signo que suma el repositorio existente.
ALTER TABLE "points_movements" ADD CONSTRAINT "points_movements_earn_positive"
    CHECK ("type" <> 'EARN' OR ("points" > 0 AND "payment_id" IS NOT NULL));

-- La unicidad parcial conserva Payment.pointsMovements y permite otros tipos.
CREATE UNIQUE INDEX "points_movements_one_earn_per_payment"
    ON "points_movements"("payment_id") WHERE "type" = 'EARN';

-- No se borra ni normaliza historia: datos incompatibles abortan toda la migración.
INSERT INTO "loyalty_accounts" ("user_id", "points")
SELECT "customer_id", SUM("points")::INTEGER
FROM "points_movements"
GROUP BY "customer_id";

COMMIT;
