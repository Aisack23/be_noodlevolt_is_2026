# BE-07: puntos por pago aprobado

## Contrato

Fuente: HU-07 y BE-07 del PDF final `V_FINAL_HISTORIAS_USUARIO_ELEKTRO_PROYECTO_3_IS_02_2026.pdf`, páginas 15–17, y los criterios aprobados para esta tarea. El contrato final usa un punto por dólar completo y `GET /api/v1/loyalty/me`; sustituye para BE-07 la regla configurable y la ruta de historial de la plantilla anterior. Se reutilizan los modelos y las restricciones de [DB-07](lealtad-db07.md).

`GET /api/v1/loyalty/me` devuelve HTTP 200 con `{ "points": 12 }`. Solo admite CLIENT (CLIENTE en la HU). El controlador obtiene el usuario mediante `@CurrentUser()` y el servicio usa exclusivamente su `id`. Sin cuenta devuelve `{ "points": 0 }` y no crea una cuenta al consultar. El saldo es global del cliente, acumulado por sus pedidos, sin seleccionar una sucursal desde el navegador.

401: falta sesión, token inválido/expirado o usuario inexistente/inactivo, según el guard global. 403: el rol no es CLIENT. No se expone una ruta de consulta por identificador; `/api/v1/loyalty/:userId` responde 404. Parámetros adicionales no permiten cambiar el titular del saldo. Swagger documenta el DTO y los errores de la operación.

Con `NUMERIC(10,2)` no hay un importe almacenado que distinga `Decimal.floor()` de `Math.floor(Number(totalPaid))`: el máximo es 99999999.99 y el error máximo de conversión a binary64 es menor que 0.000000008, muy inferior al centavo que separa un valor no entero del siguiente entero; los enteros del rango son exactos. `0.29 * 100` introduce una multiplicación ajena a la regla fija, y `1.0000000001` se almacena como 1.00. Se usa Decimal para mantener la aritmética monetaria exacta sin depender de esas cotas.

## Acreditación y transacción

`SimulatedPaymentsRepository.record` invoca `LoyaltyRepository.accruePayment(payment.id, tx)` inmediatamente después de crear el pago. Se conserva la transacción y el bloqueo FOR UPDATE del pedido de BE-06. Pago, comprobante simple, EARN e incremento de LoyaltyAccount se confirman juntos; cualquier fallo revierte las escrituras de esa confirmación.

El repositorio carga el pago y su pedido dentro de esa transacción. La función pura de dominio `calculatePoints`, sin Nest ni Prisma, verifica PAID, cliente asociado de rol CLIENT, pedido no cancelado y sucursal coincidente entre pago y pedido. Usa `payment.totalPaid.floor()` de Decimal y convierte únicamente los puntos enteros a number después de verificar el rango de INTEGER de PostgreSQL. El repositorio no inyecta servicios; la consulta sigue servicio → repositorio. No consulta ni modifica PointsRule: la regla de esta HU es fija.

Un rechazo, pago pendiente/reembolsado, pago sin cliente elegible, pedido cancelado o sucursal inconsistente no genera acreditación. Si el resultado es cero tampoco crea EARN ni LoyaltyAccount. Un paymentId inexistente no tiene efecto en el procesador interno.

La inserción parametrizada usa el mismo cliente transaccional:

```sql
INSERT INTO points_movements (id, customer_id, type, points, payment_id)
VALUES (..., ..., 'EARN', ..., ...)
ON CONFLICT (payment_id) WHERE type = 'EARN' DO NOTHING;
```

Solo cuando la inserción afecta una fila se ejecuta el upsert de LoyaltyAccount con incremento atómico. PostgreSQL resuelve el conflicto del índice parcial incluso entre transacciones simultáneas: el duplicado no produce P2002, no aumenta el saldo y no aborta la transacción. El método también puede abrir su propia transacción para reprocesar eventos existentes. Los errores de Prisma se traducen a LoyaltyAccrualError conservando la causa; el repositorio nuevo no lanza excepciones HTTP. La capacidad máxima de saldo sigue siendo INTEGER; un desbordamiento revierte la operación.

`PointsMovementRepository.findByPayment` filtra `type: 'EARN'`: un ajuste o canje asociado al pago no sustituye una acreditación. Los cambios de saldo nuevos quedan respaldados por un EARN; se conservan los saldos inicializados por la migración DB-07.

El evento de puntos es idempotente por paymentId. Un segundo intento de cobro HTTP conserva el 409 de BE-06. Dos confirmaciones HTTP simultáneas producen un 201 y un 409, con un único pago, comprobante y EARN.
