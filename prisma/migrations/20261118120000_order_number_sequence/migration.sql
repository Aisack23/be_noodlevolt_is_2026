BEGIN;
-- Número legible por pedido (HU-03, FE-03). Una secuencia global garantiza la
-- unicidad bajo concurrencia; el DEFAULT la consume dentro de la transacción
-- que inserta el pedido, sin importar si es de salón o para llevar.
-- El formato ORD-000001 nunca colisiona con los números fijos de los seeds.
CREATE SEQUENCE order_number_seq AS BIGINT START 1;

-- Pedidos existentes: se numeran en orden de creación.
WITH numbered AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS n
  FROM orders
  WHERE order_number IS NULL
)
UPDATE orders o
SET order_number = 'ORD-' || lpad(numbered.n::text, 6, '0')
FROM numbered
WHERE o.id = numbered.id;

-- Los nuevos pedidos continúan después del último número asignado al backfill.
SELECT setval('order_number_seq', GREATEST(count(*), 1), count(*) > 0)
FROM orders
WHERE order_number LIKE 'ORD-%';

ALTER TABLE orders
  ALTER COLUMN order_number SET DEFAULT ('ORD-' || lpad(nextval('order_number_seq')::text, 6, '0')),
  ALTER COLUMN order_number SET NOT NULL;
COMMIT;
