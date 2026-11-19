BEGIN;
-- Quitar la columna de nuevos pedidos sin perder números ya entregados a cocina
-- ni a clientes: si existe algún ORD-, se respalda y se retira antes de revertir.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM orders WHERE order_number LIKE 'ORD-%') THEN
    RAISE EXCEPTION 'Respaldar y retirar los números ORD- antes de revertir HU-03 (número de pedido)';
  END IF;
END $$;
ALTER TABLE orders
  ALTER COLUMN order_number DROP NOT NULL,
  ALTER COLUMN order_number DROP DEFAULT;
DROP SEQUENCE order_number_seq;
COMMIT;
