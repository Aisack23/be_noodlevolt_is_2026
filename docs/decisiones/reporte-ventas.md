# Decisiones: reporte de ventas por sucursal

## Alcance y contrato

- El endpoint de reporte se expone en `GET /api/v1/reports/sales`.
- El contrato v1 responde exactamente `{ from, to, branchId | null, total, paymentsCount }`.
- No se incluye `byDay`; esa salida queda fuera de alcance para este cambio.
- El total se devuelve como string con dos decimales y la suma se hace con `Prisma.Decimal`.

## Reglas de negocio

- Se cuentan únicamente pagos en estado `PAID`.
- Se excluyen pedidos con `status = 'CANCELED'`, incluso si el pago asociado está `PAID`.
- El rango se interpreta en la zona horaria local de cada sucursal y se convierte a UTC semiabierto `[inicio, fin)`.
- El rango máximo permitido es 366 días inclusive; si se excede, responde `400`.
- Para `BRANCH_ADMIN`, `branchId` ausente o igual a la sucursal del usuario funciona; cualquier otro branchId existente o no responde `403`.
- Para `GENERAL_MANAGER`, sin `branchId` consolida todas las sucursales, incluidas inactivas; con `branchId` y sucursal inexistente responde `404`.
- Otros roles responden `403`, y sin sesión `401`.

## Justificación de la decisión de CANCELED

La regla de negocio del reporte exige contar ventas aprobadas y excluir pagos rechazados y pedidos cancelados. Como el flujo actual no define una reversión formal ni un pago de compensación para un pedido cancelado, la opción consistente y segura es excluir el pedido del agregado aunque el pago esté `PAID`.

## Trazabilidad y validación

El cálculo se implementa en repositorio y servicio para respetar el patrón del proyecto:

- repositorio: acceso a Prisma y agregación
- servicio: autorización por rol/sucursal, validaciones y error mapping
- controller: Swagger + HTTP + JWT

La validación se cubre con:

- pruebas unitarias de rango y timezone
- prueba DB-10 de suma exacta y exclusión de casos
- prueba HTTP con JWT para el endpoint real
