# DB-10: reportes de ventas por sucursal y fechas

## Alcance

DB-10 no crea una tabla de reportes, acumulados ni totales materializados. El
reporte de ventas se calcula a demanda con `orders` y `payments`, evitando que
un valor derivado quede desactualizado al cambiar un pago o el estado de un
pedido.

La consulta base de BE-10 debe unir `payments` con `orders` y sumar únicamente
`payments.total_paid` cuando se cumplan todas estas condiciones:

- `payments.status = 'PAID'`.
- `orders.status <> 'CANCELED'`.
- El pago pertenece a la sucursal y al intervalo solicitado.
- El pago tiene pedido asociado mediante el `JOIN` interno por `order_id`.

`total_paid` es `NUMERIC(14,2)` y la suma se conserva como `NUMERIC`; no se
convierte a `float` ni a `number` para la agregación. El `JOIN` interno excluye
pagos sin pedido, porque el reporte cuenta ventas una vez por pedido.

BE-06 conserva intentos rechazados y aprobados. El índice único parcial
`payments_one_approved_order` sobre `payments(order_id) WHERE status = 'PAID'`
garantiza como máximo un pago aprobado por pedido. DB-10 lo reutiliza y no crea
otra restricción equivalente.

## Fecha y zona horaria

`Payment` no tiene `paid_at`. En el flujo actual de BE-06 cada intento se crea
directamente con estado final `PAID` o `REJECTED`, sin transición posterior;
por ello `payments.created_at` es la fecha efectiva de pago para este reporte.
Si en el futuro un pago pasa de `PENDING` a `PAID`, deberá añadirse una fecha de
aprobación explícita antes de reutilizar este criterio.

Cada rango recibido por la API se interpreta como días locales de la sucursal,
usando `branches.time_zone` (por defecto `America/El_Salvador`). BE-10 debe
convertir los límites locales a UTC y consultar un intervalo semiabierto:

```text
[inicio_local AT TIME ZONE branch.time_zone,
 fin_local_exclusivo AT TIME ZONE branch.time_zone)
```

Para una consulta del día `2026-01-15` en El Salvador, los límites son
`2026-01-15T06:00:00Z` y `2026-01-16T06:00:00Z`. Por tanto se incluyen
`2026-01-15 00:00:00` y `2026-01-15 23:59:59` locales, y se excluye
`2026-01-16 00:00:00` local. Esto evita perder pagos cuyo día UTC difiere del
día local de la sucursal.

## Índice

La migración `20261111120000_sales_reports_index` agrega:

```sql
CREATE INDEX payments_paid_branch_id_created_at_idx
  ON payments (branch_id, created_at)
  INCLUDE (total_paid, order_id)
  WHERE status = 'PAID';
```

El índice parcial evita indexar intentos no aprobados. Las claves permiten
restringir por sucursal y rango de fecha; las columnas incluidas cubren la suma
y la unión con `orders` cuando PostgreSQL puede usar un plan index-only. El
índice existente `payments_branch_id_created_at_idx` se conserva porque también
cubre consultas de todos los estados.

La prueba DB-10 usa `EXPLAIN (FORMAT JSON)` sobre la consulta representativa.
Deshabilita el escaneo secuencial dentro de su transacción para comprobar que el
índice parcial es elegible en una tabla temporal pequeña; en producción la
elección final del plan depende de estadísticas y cardinalidad.

Nota de ejecución: la validación no debe exigir que PostgreSQL use exactamente
`payments_paid_branch_id_created_at_idx` en todas las ejecuciones. El planner es
libre de elegir un `Seq Scan` o un `Bitmap Index Scan` según el tamaño de la
tabla, la selectividad y las estadísticas. En la base local de esta sesión se
observó un plan con `Seq Scan` aunque el índice existía y la consulta devolvía
resultados correctos; eso no invalida la migración ni la lógica del reporte. Por
tanto, la prueba debe centrarse en el resultado funcional o, como máximo, en que
el índice sea elegible, no en una cadena literal exacta dentro del JSON de
`EXPLAIN`.

## Seed y validación

`npm run db:seed:sales-report` inserta de forma idempotente ocho pedidos de
referencia para las dos sucursales base: seis pagos `PAID`, dos `REJECTED`, un
pedido cancelado y valores decimales como `12.75` y `0.99`. Incluye los límites
locales y un caso cuyo día UTC cruza el día local de El Salvador.

La prueba `test/db-sales-reports.e2e-spec.ts` verifica suma exacta, exclusión
de rechazos y cancelaciones, fronteras semiabiertas, aislamiento por sucursal,
precisión decimal y la unicidad de pagos aprobados. No se actualiza el diagrama
ER: DB-10 no añade entidades, relaciones ni columnas.
