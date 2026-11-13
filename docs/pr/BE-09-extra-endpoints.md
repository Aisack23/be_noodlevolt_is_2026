# fix(BE-09): marcar avisos propios como leídos y consultar contador pendiente

## Qué cambia

- Se añade `PATCH /api/v1/notifications/:id/read` para marcar un aviso propio como leído.
- Se incorpora `unreadCount` a `GET /api/v1/notifications/me`, calculado sobre todo el buzón del usuario e independiente de la paginación.
- `total` conserva su significado: cantidad de avisos propios, leídos y no leídos. Consultar el buzón no cambia `isRead`.
- La escritura filtra por ID y propietario autenticado. Un aviso ajeno o inexistente devuelve el mismo `404`.
- La operación es idempotente, incluso con peticiones concurrentes. Reprocesar `READY` no duplica avisos ni los vuelve a marcar como no leídos.
- Se documenta el contrato en Swagger y en `docs/decisiones/notificaciones-be09.md`.
- Se añaden siete casos aislados y cuatro E2E; se amplían las comprobaciones de permisos existentes.
- Se corrige únicamente un fixture de pagos que omitía la dependencia `LoyaltyRepository` del constructor y bloqueaba `tsc --noEmit`. No cambia la lógica de pagos.

## Por qué

El backend permitía listar avisos, pero no marcar su lectura. El frontend no
podía mantener un contador de avisos pendientes. Este cambio permite confirmar
la lectura y consultar el número real de pendientes sin eliminar avisos ni
alterar la paginación existente.

## Contrato para FE-09

```http
PATCH /api/v1/notifications/10000000-0000-4000-8000-000000000001/read
Authorization: Bearer <accessToken>
```

No requiere cuerpo; también acepta `{}`. Devuelve `200` con el aviso completo,
incluido `isRead: true`:

```json
{
  "id": "10000000-0000-4000-8000-000000000001",
  "type": "PEDIDO_LISTO",
  "title": "Tu pedido está listo",
  "message": "Tu pedido A-1 está listo para retirar en NoodleVolt Centro.",
  "orderId": "20000000-0000-4000-8000-000000000001",
  "isRead": true,
  "createdAt": "2026-11-13T14:00:00.000Z"
}
```

Después de confirmar la lectura, refrescar el buzón:

```http
GET /api/v1/notifications/me?page=1&limit=20
Authorization: Bearer <accessToken>
```

El sobre incluye `items`, `total`, `unreadCount`, `page` y `limit`. Por ejemplo,
un aviso leído produce `total: 1` y `unreadCount: 0`. Un buzón vacío devuelve
`items: []`, `total: 0` y `unreadCount: 0`.

El contador visual debe usar `unreadCount`; no usar `total`, la cantidad de
elementos de la página ni descontar una unidad por cada reintento del PATCH.

| Estado HTTP | Resultado del PATCH                                  |
| ----------- | ---------------------------------------------------- |
| 200         | Aviso propio marcado como leído; incluye reintentos. |
| 400         | ID no UUID o cuerpo con datos no permitidos.         |
| 401         | Falta sesión válida.                                 |
| 403         | Usuario autenticado con rol distinto de CLIENT.      |
| 404         | Aviso inexistente o ajeno.                           |

## Cómo probarlo

Con dependencias instaladas y Prisma Client generado desde el esquema actual:

```bash
npm run prisma:generate
npx tsc --noEmit
npm run build
npm run lint
npm test
```

Con `DATABASE_URL` apuntando a PostgreSQL exclusivo de pruebas, con todas las
migraciones aplicadas:

```bash
npx vitest run --config vitest.config.e2e.ts test/db-notifications-api.e2e-spec.ts
```

Para la suite completa, el siguiente script crea una base temporal, aplica las
migraciones y elimina exclusivamente esa base al terminar. El usuario indicado
por `DATABASE_URL` necesita permiso para crear bases:

```bash
node scripts/test-e2e-isolated.mjs
```

## Resultados registrados: 13 de noviembre de 2026

Validación local con Prisma Client 7.10 y PostgreSQL **18.6**:

- [x] `npx tsc --noEmit`: completado correctamente.
- [x] `npm run build`: completado correctamente.
- [x] `npm test`: **241/241 pruebas aprobadas**, 20 suites.
- [x] E2E de la API BE-09: **12/12 aprobadas**, incluidas las cuatro nuevas de lectura, concurrencia, aislamiento y contador entre páginas.
- [x] `npm run lint`: salida 0, con **ocho advertencias preexistentes** en otros archivos; no se declara libre de advertencias.
- [x] Formato de los archivos TypeScript modificados y `git diff --check`: sin incidencias.
- [x] Suite E2E completa ejecutada con base temporal migrada: **340 aprobadas y 2 fallidas**, 25 suites aprobadas y una fallida, sin casos omitidos.
- [x] Los mismos dos fallos se reprodujeron en una copia limpia de `develop` (`f197a9c`), con PostgreSQL 18 y otra base temporal: **14 aprobadas y 2 fallidas** en la suite de pedidos.
- [ ] Suite E2E global completamente verde: persisten esos dos fallos previos de BE-02.
- [ ] Frontend y CI: no ejecutados ni verificados en esta entrega.

Los fallos previos pertenecen a `test/db-orders.e2e-spec.ts`: el caso ONLINE
recibe un `pickupAt` no interpretable como fecha y el caso AT_COUNTER recibe
`paymentMode: ONLINE`. No se modifican ni omiten esos casos.

La preparación local utilizó el generador oficial JavaScript de Prisma para
generar el cliente y PostgreSQL 18 compilado en el directorio de trabajo, dado
que Docker estaba detenido y el usuario del entorno carece de permiso para
iniciarlo. No se modificó la configuración publicada del entorno. La primera
ejecución con PostgreSQL 17 mostró diferencias de SQLSTATE en siete pruebas de
restricciones; la ejecución final con PostgreSQL 18 resolvió esas diferencias.

El mensaje `BE09 rollback test` en los logs procede del trigger de fallo
deliberado del caso de atomicidad; esa prueba pasó. Los resultados anteriores
son de ejecuciones locales, no de CI.

## Integración y alcance

- Rama origen: `feat/BE-09-extra-endpoints`.
- Rama destino: `develop`.
- Base: `f197a9c9630c248bc618ac434881d29a8f590557`.
- No requiere migraciones ni dependencias nuevas. Utiliza `notifications.is_read` existente.
- No incorpora cambios anteriores sin subir de otras historias.
- Quedan fuera la pantalla frontend, lectura masiva, volver a no leído y los fallos de pedidos previos a esta rama.
- El autor crea el PR y asigna la persona revisora.
