# BE-06: pagos simulados

## API

`POST /api/v1/payments/simulate` requiere sesión y rol CLIENT. Solo acepta
`orderId` UUID y `cardToken`: `test_4242` aprueba, `test_0002` rechaza. No se
aceptan número de tarjeta, CVV, importe, propietario ni campos adicionales.

```json
{
  "orderId": "20000000-0000-4000-8000-000000000001",
  "cardToken": "test_4242"
}
```

Ambos resultados responden 201, porque se registra un intento. La respuesta
contiene id, orderId, status (APROBADO/RECHAZADO), amount (string decimal), last4,
reason y receipt. Un rechazo incluye motivo y receipt=null. El cliente debe
consultar status y no interpretar 201 como aprobación.

401: sesión inválida. 403: rol incorrecto o pedido ajeno. 404: pedido inexistente.
409: pedido cancelado, ya aprobado, sin líneas o sin importe positivo. 400: DTO
inválido. No se cambia el estado de preparación del pedido al pagar.

## Flujo y persistencia

Primero se verifica titularidad y ausencia de pago aprobado, luego se ejecuta la
simulación de dos segundos fuera de la transacción. Se vuelve a validar todo
bajo bloqueo FOR UPDATE de Order al persistir. Dos autorizaciones simultáneas
pueden completarse, pero solo una puede registrar un pago aprobado; la otra
recibe 409. No existe un cobro externo real.

El importe se calcula exclusivamente con los precios históricos y cantidades de
OrderItem, usando Prisma.Decimal. No depende del precio actual del menú ni del
importe que envíe el navegador. Esta decisión permite partir de develop sin
incorporar el PR pendiente de BE-02; su total persistido deberá coincidir con
estas mismas líneas.

Se conservan los estados existentes: PAID equivale a APROBADO y REJECTED a
RECHAZADO. Un rechazo conserva subtotal como importe intentado y totalPaid=0.
Una aprobación registra subtotal=totalPaid e inserta SimpleReceipt en la misma
transacción. SimpleReceipt es un comprobante no fiscal, separado de los modelos
fiscales preexistentes. No se registra el token de prueba ni se añade logging de
requests. Únicamente se guardan last4, estado y motivo.

La relación Order.payment pasa a Order.payments para conservar intentos. El
índice parcial payments_one_approved_order garantiza como máximo un PAID por
orderId. La unicidad paymentId de SimpleReceipt impide dos comprobantes para el
mismo pago. PaymentRepository.findByOrder ahora devuelve el intento más reciente;
los reportes deben filtrar status=PAID, no basarse en ese método para decidir si
un pedido está pagado.

No se acreditan puntos en esta entrega: corresponde a HU-07, que deberá usar
Payment.id como clave única y ejecutar su acreditación de forma atómica. Los
reportes también se integran en su tarea y deben sumar exclusivamente PAID.

## Migración y reversión

20261106200000_simulated_payments permite intentos múltiples, añade last4 y
rejection_reason, aumenta subtotal/total_paid a NUMERIC(14,2) y crea
simple_receipts. Se conserva accountId único para cuentas existentes.

La reversión exige que no existan varios pagos por pedido y que los importes
quepan en NUMERIC(12,2); PostgreSQL rechaza la reversión si no se cumple. Además,
revertir elimina los comprobantes simples: debe planificarse preservación de
esos datos antes de usar down.sql sobre datos reales. No se borran intentos
para forzar una reversión.

## Validación local

- 18 pruebas de servicio/HTTP con JWT real, persistencia simulada y gateway real
  para la demora: aprobadas.
- 5 pruebas de restricciones en PostgreSQL real, en base temporal: aprobadas.
- Aplicación, reversión y reaplicación de migraciones: aprobadas.
- Lint sin tipos de los archivos nuevos: sin incidencias.
- Compilación: fallida porque falta Prisma Client generado.
- Endpoint completo con Prisma: la suite falla al iniciar; 5 casos omitidos.
- No se ha configurado ni verificado ejecución en CI.

No se puede afirmar que el endpoint completo haya pasado sus pruebas hasta
habilitar binaries.prisma.sh, regenerar el cliente, aplicar migraciones y ejecutar
la suite real. El esquema y los tests aislados no sustituyen esa comprobación.
