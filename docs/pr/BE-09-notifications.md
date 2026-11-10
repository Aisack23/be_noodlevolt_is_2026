# feat(BE-09): buzón propio y aviso idempotente de pedido listo

## Qué cambia

- Se implementa GET /api/v1/notifications/me para el cliente autenticado, con paginación y aislamiento por propietario.
- Se responde con items, total, page y limit; un buzón vacío usa items=[] y total=0.
- Se incorpora el servicio interno notifyOrderReady(orderId, tx), sin ruta pública de creación de notificaciones.
- La transición de cocina a READY genera PEDIDO_LISTO dentro de la misma transacción de estado, líneas e historial.
- Si falla el aviso, se revierte toda la transición. Los reintentos READY no duplican auditoría ni avisos.
- Se reutiliza la unicidad DB-09 por usuario/eventKey y la FK al pedido; no se añaden migraciones ni dependencias.
- Se documentan respuestas y permisos en Swagger.
- Se añaden 18 pruebas aisladas y ocho E2E de HU-09.

## Criterios de aceptación

- [x] Al marcar el pedido READY, el cliente ve un aviso asociado a su orderId.
- [x] Sin avisos, el buzón devuelve una colección vacía y total=0; FE puede mostrar «No tienes avisos todavía».
- [x] Reprocesar PEDIDO_LISTO:orderId:recipientId no duplica la notificación, también bajo concurrencia.
- [x] Un fallo de creación de aviso revierte estado, líneas e historial de cocina.
- [x] El cliente no consulta avisos ajenos ni puede fabricar un evento desde HTTP.

## Contrato para frontend

```http
GET /api/v1/notifications/me?page=1&limit=20
Authorization: Bearer <accessToken>
```

```json
{
  "items": [
    {
      "id": "10000000-0000-4000-8000-000000000001",
      "type": "PEDIDO_LISTO",
      "title": "Tu pedido está listo",
      "message": "Tu pedido A-1 está listo para retirar en NoodleVolt Centro.",
      "orderId": "20000000-0000-4000-8000-000000000001",
      "isRead": false,
      "createdAt": "2030-01-01T18:00:00.000Z"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 20
}
```

No enviar userId/branchId. Solo CLIENT: 401 sin sesión válida, 403 para personal,
400 si hay query extra o paginación inválida. No se cambia isRead con el GET.
READY es el estado persistido equivalente a LISTO. El frontend consulta el buzón;
no se implementa WebSocket ni una pantalla en este backend.

## Cómo probarlo

Usar una base PostgreSQL exclusiva para pruebas, con migraciones DB-09 y Prisma
Client actualizado. Para build y pruebas aisladas:

```bash
npx tsc --noEmit
npm run build
npm run lint
npm test
npx vitest run src/notifications/services/notifications.spec.ts
```

Para toda la integración en una base temporal migrada, sin alterar desarrollo:

```bash
node scripts/test-e2e-isolated.mjs
```

Con una base exclusiva ya migrada también se puede ejecutar solo HU-09:

```bash
npx vitest run --config vitest.config.e2e.ts test/db-notifications-api.e2e-spec.ts
```

## Resultados registrados

- [x] npx tsc --noEmit: aprobado.
- [x] npm run build: aprobado.
- [x] Unitarias globales: **214/214 aprobadas**, 17 suites.
- [x] Nuevas pruebas aisladas BE-09: **18/18 aprobadas**.
- [x] Nuevas E2E HU-09: **8/8 aprobadas** con PostgreSQL y Prisma reales, también repetidas por separado.
- [x] Lint de los archivos nuevos y git diff --check: sin incidencias.
- [x] Lint global: exit 0, con ocho advertencias previas; no se declara sin advertencias.
- [ ] E2E global totalmente verde: **290 aprobadas y 2 fallidas**, 22 suites aprobadas y una fallida. Fallan los casos previos de pedidos pickupAt y AT_COUNTER. No se omitieron ni deshabilitaron.
- [ ] Frontend y CI no ejecutados/verificados en esta entrega.

El error de PostgreSQL «BE09 rollback test» en los logs es provocado por el caso
de atomicidad, que comprueba 500 y ausencia de cambios confirmados. Ese caso pasó;
no representa un fallo sin diagnosticar de la suite.

## Correcciones mínimas previas necesarias para validar

- Se cierra el describe que faltaba al final de db-reservations-booking.e2e-spec.ts en develop.
- Se fija como literal el rol COOK del fixture unitario de cocina, evitando TS2345 por inferencia como string.

## Qué queda fuera

- Vista y actualización visual de FE-09.
- Correo, push, WebSocket y marcar notificaciones como leídas.
- Arreglos de los dos fallos de pedidos u otras advertencias de módulos ajenos.

## Integración

- Rama origen: feat/BE-09-notifications.
- Rama destino: develop.
- Base: b2581f3d463d7d5bcf2b1da62322c930bfdb4471.
- El autor crea el PR y asigna reviewer.
- No cambia el contrato existente de PATCH /api/v1/kitchen/orders/:id/status; se añade su efecto transaccional de notificación al confirmar READY.
