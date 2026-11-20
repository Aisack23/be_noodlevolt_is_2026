BEGIN;

-- Impide insertar saldos entre la comprobación de pérdida y el DROP.
LOCK TABLE "loyalty_accounts" IN ACCESS EXCLUSIVE MODE;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM "loyalty_accounts") THEN
        RAISE EXCEPTION 'DB-07: no se puede revertir mientras existan cuentas de lealtad; se perderían saldos o fechas de auditoría.';
    END IF;
END $$;

DROP TABLE "loyalty_accounts";
DROP INDEX "points_movements_one_earn_per_payment";
ALTER TABLE "points_movements" DROP CONSTRAINT "points_movements_earn_positive";

COMMIT;
