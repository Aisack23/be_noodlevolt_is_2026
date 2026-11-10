# HU-04 / BE-04: reservar una mesa disponible

## Contrato

POST /api/v1/reservations requiere JWT válido y rol CLIENT del usuario persistido.
El usuario propietario se toma de la sesión; no se admite customerId/userId ni
asignación de mesa, estado o fin del intervalo desde el navegador.

```json
{
  "branchId": "10000000-0000-4000-8000-000000000001",
  "startsAt": "2030-01-10T19:00:00-06:00",
  "guests": 4,
  "contactName": "Isaac",
  "phone": "+50370000000"
}
```

startsAt es ISO 8601 con zona explícita (Z u offset), válido y futuro; se guarda
su instante UTC. guests es entero de 1 a 100. contactName es obligatorio, no
vacío y máximo 120 caracteres; phone admite formato de teléfono de hasta 30
caracteres con al menos siete dígitos. Se rechazan campos adicionales.
Los campos de contacto son obligatorios en el schema existente y no se inventan.

Respuesta 201: id, branchId, tableId, guests, startsAt, endsAt y status CONFIRMED.
Las fechas se serializan en UTC ISO 8601. CONFIRMED representa CONFIRMADA en la UI.
El intervalo siempre dura 90 minutos. Fechas/datos inválidos devuelven 400,
sesión inválida 401, personal no CLIENT 403, sucursal inexistente/inactiva 404,
y ausencia de mesa elegible o disponibilidad 409.

## Selección y concurrencia

Se reutilizan Branch, DiningTable y Reservation, sin migraciones ni dependencias.
La selección automática prioriza la menor capacidad suficiente y luego UUID.
Solo usa mesas AVAILABLE de la sucursal solicitada. No cambia el estado físico
de una mesa al reservar un intervalo futuro.

Una transacción Prisma con aislamiento READ COMMITTED:

1. Bloquea la sucursal activa con FOR SHARE.
2. Bloquea mesas elegibles con FOR UPDATE en orden consistente (capacidad, ID).
3. Revalida fecha futura después de esperar posibles bloqueos.
4. Consulta reservaciones CONFIRMED que solapen el intervalo y escoge una mesa libre.
5. Inserta CONFIRMED con el propietario autenticado y confirma todo junto.

El solapamiento usa existing.startsAt < new.endsAt y existing.endsAt > new.startsAt.
Los intervalos son semiabiertos: una reservación puede comenzar exactamente al
terminar otra. Las canceladas no bloquean disponibilidad. Si una mesa está
ocupada y otra tiene capacidad suficiente, se asigna la segunda antes de 409.

Dos solicitudes simultáneas esperan sobre las mismas filas de mesa. La segunda
consulta las reservas confirmadas por la primera antes de insertar; no se usa
una consulta previa sin bloqueo ni SKIP LOCKED que genere un rechazo prematuro.
El timeout de transacción es de diez segundos. Para conservar esta garantía,
cualquier futura escritura de reservaciones debe usar el mismo protocolo de
bloqueo de mesa; no se agrega una restricción de exclusión en esta entrega.

## Alcance

No se implementan cancelaciones, horarios comerciales ni duración configurable:
no forman parte de los tres criterios de esta HU. Tampoco se reutiliza isOpen
para bloquear reservas futuras: ese estado controla la recepción de pedidos
según HU-11, y no define horarios para visitas futuras.

Los cambios locales pendientes de orders/me se preservaron en un stash separado,
no se incluyeron en esta rama. Se utilizó develop remoto como base.

## Resultados de validación

- npx tsc --noEmit y npm run build: aprobados.
- Suite unitaria completa: 188/188 aprobadas, 14 suites.
- Pruebas nuevas aisladas BE-04: 20/20 aprobadas, con guard JWT real.
- Pruebas E2E de HU-04: 8/8 aprobadas con AppModule, Prisma y PostgreSQL reales.
- Ejecución E2E global: 280 aprobadas, 3 fallidas; 20 suites aprobadas y 2 fallidas.
  Fallan dos casos de pedidos por paymentMode/pickupAt y un timeout en el seed
  idempotente de notificaciones. No se tocaron esos módulos ni se omitieron tests.
- Repetición aislada de reservaciones y notificaciones: 17/17 aprobadas, incluidas
  las ocho pruebas HU-04 y las nueve de notificaciones. El timeout no se reprodujo.
- Lint con tipos sobre archivos BE-04 y su test E2E: sin incidencias.
- Lint global: exit 0 con ocho advertencias en archivos previos de pedidos,
  inventario de pruebas y menú/pagos; no se declara lint global sin advertencias.
- git diff --check: sin incidencias. No se configuró ni verificó CI.
