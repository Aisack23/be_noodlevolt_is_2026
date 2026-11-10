# feat(BE-04): reservar mesas disponibles con protección de concurrencia

## Qué cambia

- Se implementa POST /api/v1/reservations para el rol CLIENT con sesión válida.
- Se validan sucursal, fecha futura con zona horaria, número de personas y datos de contacto.
- La mesa se asigna automáticamente por capacidad suficiente, disponibilidad e ID, únicamente dentro de la sucursal solicitada.
- Se registra una reservación CONFIRMED de 90 minutos con el usuario obtenido de la sesión.
- Se bloquean filas de mesas dentro de una transacción READ COMMITTED para impedir confirmaciones simultáneas solapadas sobre la misma mesa.
- Se responde 201 al confirmar, 409 sin disponibilidad, 400 ante datos/fecha inválidos, 401 sin sesión, 403 por rol y 404 para sucursal inexistente/inactiva.
- Se documenta el contrato en Swagger y docs/decisiones/reservaciones-be04.md.
- Se reutilizan las entidades existentes; no se añaden migraciones ni dependencias.

## Criterios de aceptación

- [x] Mesa libre con capacidad suficiente: se registra CONFIRMED, equivalente a CONFIRMADA en la interfaz.
- [x] Reserva solapada y sin otra mesa elegible: se rechaza con 409.
- [x] Fecha pasada: responde 400 sin guardar reservaciones.
- [x] Dos confirmaciones simultáneas para una sola mesa producen 201 y 409, con una sola fila confirmada.
- [x] Se permiten intervalos adyacentes y se busca otra mesa si la primera está ocupada.

## Contrato para frontend

```http
POST /api/v1/reservations
Authorization: Bearer <accessToken>
Content-Type: application/json
```

```json
{
  "branchId": "10000000-0000-4000-8000-000000000001",
  "startsAt": "2030-01-10T19:00:00-06:00",
  "guests": 4,
  "contactName": "Isaac",
  "phone": "+50370000000"
}
```

Respuesta: id, branchId, tableId, guests, startsAt, endsAt y status=CONFIRMED.
Las fechas se devuelven en UTC ISO 8601; frontend puede mostrarlas en la zona
horaria de la sucursal. guests debe ser entero de 1 a 100. Contacto y teléfono
son obligatorios en el modelo existente. No se aceptan userId/customerId,
tableId, endsAt ni status enviados por el navegador.

## Cómo probarlo

Con Prisma Client generado, migraciones aplicadas y DATABASE_URL de una base exclusiva de pruebas:

```bash
npx tsc --noEmit
npm run build
npm run lint
npm test
npx vitest run src/reservations/services/reservation-booking.spec.ts
npx vitest run --config vitest.config.e2e.ts test/db-reservations-booking.e2e-spec.ts
```

Para ejecutar toda la suite con migraciones en PostgreSQL temporal, sin alterar la base de desarrollo:

```bash
node scripts/test-e2e-isolated.mjs
```

El entorno cloud utilizó el generador WASM oficial local ya configurado para evitar el bloqueo de descarga nativa, sin deshabilitar TLS/checksums.

## Resultados reales

- [x] **Tipos y build completados correctamente.**
- [x] **Suite unitaria completa: 188/188 aprobadas**, 14 suites.
- [x] **Pruebas aisladas nuevas BE-04: 20/20 aprobadas.**
- [x] **E2E nuevos de HU-04: 8/8 aprobados** con PostgreSQL y Prisma reales, incluidos los tres criterios y concurrencia.
- [x] Lint con tipos de archivos BE-04: sin incidencias.
- [x] Lint global: exit 0, pero con ocho advertencias de archivos previos; no se declara totalmente limpio.
- [x] git diff --check: sin incidencias.
- [ ] **E2E global completamente verde:** la ejecución registró 280 aprobadas y 3 fallidas, en 22 suites. Dos fallos corresponden a pedidos (modalidad y retiro); el tercero fue un timeout en el seed de notificaciones.
- [x] Repetición aislada de reservaciones y notificaciones: **17/17 aprobadas**. El timeout de notificaciones no se reprodujo y no se aumentaron timeouts ni se deshabilitaron pruebas.
- [ ] CI no configurado/verificado en esta entrega.

La validación de HU-04 sí pasó. La suite global no debe marcarse como completamente aprobada; los fallos de pedidos requieren su corrección separada.

## Alcance y concurrencia

No se implementan cancelaciones, horarios comerciales ni duración configurable, fuera de los criterios solicitados. Las canceladas existentes no bloquean mesas. isOpen de HU-11 controla recepción de pedidos y no se interpreta como calendario de reservas futuras.

La garantía concurrente utiliza bloqueos de mesas, no una nueva restricción de exclusión. Futuras escrituras de reservaciones deben seguir el mismo protocolo transaccional. No se usa una consulta previa sin bloqueo ni un adaptador ficticio de disponibilidad.

## Integración

- Rama origen: feat/BE-04-reservations.
- Rama destino: develop.
- Base: 0ef9647f50f1a7c0ded8488de4b98721b62b90a0.
- El autor crea el PR y asigna reviewer.
- Los cambios locales pendientes de orders/me se preservaron en un stash separado y no se incluyeron.
