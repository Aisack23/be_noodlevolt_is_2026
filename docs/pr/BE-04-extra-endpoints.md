# HU-04: disponibilidad de mesas y confirmación protegida

Origen: `feat/BE-04-extra-endpoints` → destino: `develop`.
Base remota actualizada: `93a9bc3429b62b427e3788407c6bbd9d136edc3b`.
Validación local: 16 de noviembre de 2026. No se creó ni fusionó un PR.

## Problema y resultado

Se añade una consulta de mesas disponibles, incluidas las que nunca tuvieron reservas.
La confirmación conserva la asignación automática y añade selección explícita opcional.
La base impide solapamientos activos en una misma mesa incluso si una escritura evita
el repositorio de confirmación. Mesas distintas pueden confirmarse independientemente.

En el develop inicial, las 9 pruebas HTTP/PostgreSQL de HU-04 pasaron: la carrera
coordinada ya devolvía 201/409. **No se reprodujo el duplicado en la ruta actual**;
no se atribuye el reporte del frontend a una causa no demostrada. Se verificaron
instantes UTC equivalentes, estados, bloqueo y rutas. Solo existe POST de confirmación;
los métodos genéricos internos de persistencia quedan cubiertos por la exclusión SQL.
No se reutilizan como validación los resultados de `fix/backend-polish` ni de otros PR.

Hallazgos reales: la confirmación bloqueaba todas las candidatas de la sucursal;
solo CONFIRMED bloqueaba; no existía exclusión SQL. Ya se excluía únicamente
OUT_OF_SERVICE y había índices `(table_id, starts_at)`, `(branch_id, starts_at)` y
`(customer_id, starts_at)`: se conservan esos avances sin reaplicarlos.

## Contrato HTTP y Swagger

Todas las rutas usan el prefijo `/api/v1` y autenticación Bearer. Las dos siguientes
operaciones requieren CLIENT. No cambian las consultas de reservas para personal.

### GET /reservations/availability

Query obligatoria: `branchId` UUID, `startsAt` ISO 8601 futuro con Z u offset explícito,
`guests` entero de 1 a 100. Query opcional: `roomId` UUID de un salón activo de esa
sucursal. El intervalo es fijo: `[startsAt, startsAt + 90 minutos)`. No se acepta
`endsAt` ni duración personalizada. Se rechazan campos desconocidos.

```http
GET /api/v1/reservations/availability?branchId=20000000-0000-4000-8000-000000000001&startsAt=2027-01-10T19%3A00%3A00-06%3A00&guests=4
Authorization: Bearer <access_token>
```

Respuesta 200, arreglo ordenado por capacidad ascendente e ID, sin paginación:

```json
[
  {
    "id": "30000000-0000-4000-8000-000000000001",
    "branchId": "20000000-0000-4000-8000-000000000001",
    "roomId": null,
    "number": "1",
    "capacity": 4
  }
]
```

Devuelve `[]` cuando no hay mesas elegibles. No devuelve identificadores,
contactos ni horarios de reservas de terceros. Incluye mesas sin reservas y mesas
OCCUPIED/RESERVED físicamente ahora si están libres para ese intervalo. Excluye
OUT_OF_SERVICE, capacidad insuficiente, salones inactivos y solapamientos PENDING o
CONFIRMED. CANCELED, COMPLETED y NO_SHOW no bloquean. Mesas sin salón son elegibles.

**La consulta es orientativa**: POST valida nuevamente dentro de una transacción.
Para preservar la selección de un salón, el frontend debe enviar el `tableId`
seleccionado de esta respuesta; si lo omite, la asignación automática usa toda la sucursal.

### POST /reservations

```json
{
  "branchId": "20000000-0000-4000-8000-000000000001",
  "tableId": "30000000-0000-4000-8000-000000000001",
  "startsAt": "2027-01-10T19:00:00-06:00",
  "guests": 4,
  "contactName": "Isaac",
  "phone": "+50370000000"
}
```

`tableId` es nuevo y opcional. Al omitirlo se conserva la asignación automática por
menor capacidad suficiente e ID. Si se envía, nunca se cambia silenciosamente por
otra mesa: debe existir, pertenecer a la sucursal, tener capacidad y estar disponible.
`contactName` y `phone` siguen siendo obligatorios; no se inventan datos personales
si el frontend no los envía. Duración de 90 minutos sin cambios. El propietario
procede exclusivamente de la sesión; se rechazan `customerId`, `userId`, `status`,
`endsAt` y otros campos no admitidos. Respuesta 201 conserva los campos
`id`, `branchId`, `tableId`, `guests`, `startsAt`, `endsAt`, `status: CONFIRMED`;
las fechas se devuelven en UTC.

| Código | Condición |
| --- | --- |
| 200 | Consulta de disponibilidad válida, incluso sin resultados |
| 201 | Reserva confirmada y persistida |
| 400 | UUID/formato/offset inválido, fecha pasada, invitados no enteros o fuera de 1–100, contacto inválido o campos no admitidos |
| 401 | Sesión ausente o inválida |
| 403 | Actor distinto de CLIENT para estas operaciones |
| 404 | Sucursal inexistente o inactiva |
| 409 | Sin mesa elegible, capacidad insuficiente, mesa inexistente/de otra sucursal/fuera de servicio, salón inactivo o conflicto de intervalo; en consulta, roomId inexistente/inactivo/de otra sucursal |

## Transacciones, estados y migración

La confirmación toma FOR SHARE sobre sucursal activa y salón activo cuando aplica;
FOR UPDATE únicamente sobre la candidata elegida y vuelve a consultar solapamientos
en un nuevo statement ReadCommitted tras adquirir el bloqueo. Si la candidata dejó
de estar libre, se prueba otra solo en asignación automática. Se vuelve a comprobar
que el inicio no pasó mientras se esperaba el bloqueo.

Se consideran activos **PENDING y CONFIRMED**, tanto al consultar como al confirmar
y en SQL. Los extremos son semiabiertos: terminar exactamente al inicio de la otra
reserva es válido. No se utilizan SKIP LOCKED ni bloqueos exclusivos de sucursal.
Errores de persistencia de la exclusión se convierten en error de dominio y el servicio
lo traduce a 409; se verificó con el error real P2039/23P01 de Prisma 7.10.1.

Migración `20261116180000_reservation_overlap`:

- Instala `btree_gist` si no existe.
- Añade CHECK `ends_at > starts_at`.
- Añade exclusión GiST por mesa e intervalo `tstzrange(..., '[)')` para estados activos.
- Protege INSERT y UPDATE, incluidos cambios de estado e intervalos fuera del flujo HTTP.
- Incluye `down.sql`; conserva la extensión al revertir porque puede tener otros usuarios.
- El esquema Prisma no representa las restricciones CHECK/EXCLUDE: el SQL versionado
  es la definición de estas restricciones. No requiere campos nuevos ni regeneración por cambios de modelo.

Aplicar con `npm run prisma:deploy` antes de iniciar la versión nueva. PostgreSQL debe
permitir instalar `btree_gist` (o un administrador debe preinstalarla). La migración falla
si existen intervalos inválidos o solapamientos activos; no borra ni corrige reservas
silenciosamente. Revisar esos datos antes de desplegar. El alta de la restricción
requiere bloqueo de DDL; planificar la ventana según volumen.

Diagnóstico previo sin exponer contactos:

```sql
SELECT id FROM reservations WHERE ends_at <= starts_at;
SELECT a.id, b.id, a.table_id
FROM reservations a JOIN reservations b
  ON a.table_id=b.table_id AND a.id<b.id
WHERE a.status IN ('PENDING','CONFIRMED')
  AND b.status IN ('PENDING','CONFIRMED')
  AND a.starts_at < b.ends_at AND a.ends_at > b.starts_at;
```

## Archivos relevantes

- `src/reservations/{controllers,dto,services,repositories}/reservation-availability*`:
  contrato Swagger, validación, autorización, consulta sin datos personales.
- `src/reservations/dto/create-reservation.dto.ts`: tableId opcional y offset validado.
- `src/reservations/repositories/reservation-booking.repository.ts`: bloqueo acotado,
  revalidación y traducción de exclusión a error de dominio.
- `src/reservations/controllers/reservation-booking.controller.ts` y módulo:
  documentación y registro de dependencias.
- `prisma/migrations/20261116180000_reservation_overlap/{migration,down}.sql`.
- `test/db-reservations-booking.e2e-spec.ts`: 33 casos con HTTP y PostgreSQL reales.
- Pruebas unitarias de reservas: wiring actualizado por la dependencia existente
  ReservationRepository y validaciones del contrato ampliado.
- `docs/guides/github-access.md`, enlazada desde `AGENTS.md`: recuperación oficial
  reutilizable. En esta ejecución funcionó HTTPS mediante el remoto existente;
  no fue necesario iniciar sesión ni almacenar credenciales nuevas.

## Verificación local real

Entorno: Node 24.22.1, PostgreSQL 18 en Docker, Prisma Client/adapter 7.10.1,
Vitest 5.1.0. Se reinstaló el lockfile con
`npm ci --ignore-scripts --cache /workspace/work/npm-cache` y se ejecutó
`npx prisma generate` con el generador oficial, sin binarios alternativos.
Las pruebas de integración crean una base aleatoria, aplican todas las migraciones
y la eliminan en finally; no se modificó la base de la aplicación.

Resultados finales: ver tabla a continuación.

| Comando | Resultado local |
| --- | --- |
| `npx tsc --noEmit` | Aprobado, sin errores |
| `npm run build` | Aprobado; comprobación de imports de runtime correcta |
| `npm run lint` | Exit 0, sin errores; 2 advertencias preexistentes en `src/orders/services/orders.service.ts` por imports sin uso (`ConflictException`, `NotFoundException`) |
| `npm test` | 24 archivos y 326/326 pruebas aprobados |
| `node scripts/test-e2e-isolated.mjs test/db-reservations-booking.e2e-spec.ts` | 33/33 aprobadas con PostgreSQL real |
| `node scripts/test-e2e-isolated.mjs` | 29 archivos; 415 aprobadas, 1 fallida, 416 totales; exit 1 |
| `npm run test:migrations` | Aprobado; aplicar/revertir/reaplicar y ciclo completo, incluida la nueva exclusión |
| HU-04 inicial sobre lógica de confirmación de develop, runner aislado | 9/9 aprobadas, incluida concurrencia con barrera |
| HU-03 en checkout limpio de `origin/develop` (`93a9bc3`), runner aislado dirigido a `test/db-hu03-extra.e2e-spec.ts` | 22 aprobadas, 1 fallida; reproduce el mismo fallo de la suite completa |

El runner aislado ahora permite pasar filtros de Vitest por argumentos; sin argumentos
continúa ejecutando toda la suite. La reproducción de develop se hizo en un worktree
detached, con la misma versión de dependencias y bases efímeras independientes.

**Fallo pendiente preexistente:** `test/db-hu03-extra.e2e-spec.ts:376`, caso
“rechaza roles sin permiso y sucursales ajenas”: consulta de mesas como CLIENT esperaba
403 y devolvió 200. El mismo resultado ocurre sin este trabajo en develop. No se
modificó la autorización ajena ni se relajó la expectativa. La suite general no está
verde y este PR no debe presentarse como validación completa aprobada.

Cobertura específica: mesas sin reservas/OCCUPIED/OUT_OF_SERVICE, capacidad,
solapamientos totales/parciales, extremos adyacentes, los cinco estados, fecha pasada,
offsets inválidos y offsets equivalentes, sucursal/mesa/salón ajenos o inactivos,
sesión/roles y propietario, selección explícita, manipulación de campos y no persistencia,
restricción SQL para INSERT/UPDATE y traducción del error real de Prisma a HTTP.

La carrera de la misma mesa usa un trigger temporal BEFORE INSERT y un advisory lock
controlado desde otra conexión: espera observar dos sesiones bloqueadas en PostgreSQL
antes de liberar; exige 201/409 y una sola fila. Otra prueba retiene el INSERT de una
mesa y exige 201 para otra mesa de la misma sucursal **antes** de liberar la primera.
No se usa Promise.all como única evidencia. Triggers, funciones, locks, datos y bases
se limpian en finally/afterAll.

Omisiones finales: 0 pruebas skipped en las suites ejecutadas. No se ejecutaron CI,
pruebas manuales del frontend ni despliegue en producción. Los logs de errores
intencionales de rollback/exclusión de las pruebas no significan fallos adicionales.
El primer intento del entorno no pudo iniciar las 9 pruebas por dependencias antiguas;
se reinstalaron y se repitió correctamente. También se corrigieron el fixture de rol
con sucursal y la traducción P2039 descubiertos al ampliar la verificación.

## Limitaciones de integración

- El frontend debe enviar contacto y teléfono, que continúan siendo obligatorios.
- `tableId` debe omitirse solo si se desea asignación automática. El selector visual
  puede guardar el ID devuelto por disponibilidad y enviarlo al confirmar.
- La disponibilidad puede cambiar entre GET y POST: el frontend debe manejar 409
  y volver a consultar.
- No se implementan duraciones variables, expiración automática de PENDING ni una
  política nueva de horarios de apertura; PENDING bloquea hasta cambiar de estado.
- La consulta devuelve todas las mesas elegibles; no expone reservas de terceros.
- La migración se verificó en bases efímeras; no se desplegó sobre datos de producción.
