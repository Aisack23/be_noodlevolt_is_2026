# feat(BE-03): consultar mesas y salones y canjear recompensas de lealtad

## Qué cambia

- Se añade el controlador de consultas de mesas y salones a `DiningTablesModule`, que antes solo exponía un repositorio.
- Se incorpora `GET /api/v1/branches/:branchId/rooms` con cantidad de mesas por salón.
- Se incorpora `GET /api/v1/branches/:branchId/tables`, con filtros de salón/estado y paginación.
- Se incorpora `GET /api/v1/branches/:branchId/tables/:id` para consultar una mesa de esa sucursal.
- Se añade `DiningRoom` y la relación compuesta mesa/salón/sucursal. Se asignan las mesas existentes a «Salón principal» conservando su estado.
- Se añade `GET /api/v1/loyalty/rewards` con salsa extra (20 puntos), wantanes (60), 10% de descuento (100) y rollitos primavera (150).
- Se añade `POST /api/v1/loyalty/redemptions` para aplicar una recompensa al pedido propio para llevar, pendiente y sin pagar.
- Se añade `GET /api/v1/loyalty/redemptions/me` para el historial propio paginado.
- Los productos se registran como una unidad gratuita visible en cocina. El descuento se refleja en total, cobro y comprobante; los puntos ganados se calculan sobre el importe neto pagado.
- Se guardan saldo, movimiento, canje, pedido y línea gratuita en una sola transacción. Los reintentos no duplican descuentos, productos ni débitos.
- Se añaden dos migraciones con reversión protegida, un seed de productos y documentación de Swagger/contrato.

## Por qué

El flujo de comandas necesitaba consultar la distribución de mesas y salones.
El backend tenía persistencia de mesas y puntos, pero no un modelo de salones
ni una API de recompensas y canjes. La ampliación de lealtad se incluye en esta
misma rama por solicitud expresa del responsable de la HU.

## Contrato para frontend

Las consultas de mesas/salones permiten `WAITER`, `COOK`, `CASHIER` y
`BRANCH_ADMIN` de su sucursal. `GENERAL_MANAGER` consulta otras sucursales
activas. No son rutas públicas. Las listas devuelven `{items, total, page,
limit}`; `page=1`, `limit=20`, máximo 100. Las mesas incluyen su estado físico
actual y un salón nullable para registros aún no asignados.

Lealtad requiere `CLIENT` y obtiene el propietario de la sesión. Ejemplo:

```http
POST /api/v1/loyalty/redemptions
Authorization: Bearer <accessToken>
Content-Type: application/json
```

```json
{
  "benefitId": "73000000-0000-4000-8000-000000000003",
  "orderId": "20000000-0000-4000-8000-000000000001",
  "operationKey": "30000000-0000-4000-8000-000000000001"
}
```

Se requiere una clave estable por operación. Responde 201 al aplicar y 200 al
reintentar el mismo canje. Solo se admite una recompensa por pedido `TAKEOUT`
`PENDING`, sin pago aprobado. Un pedido de `17.00` con la recompensa del 10%
queda en `15.30`; el comprobante usa ese mismo importe.

El código devuelto identifica un canje ya aplicado, con estado `USED`. FE debe
refrescar `/loyalty/me` para actualizar el saldo. Los estados físicos de mesas no
reemplazan la disponibilidad futura de BE-04.

Contrato completo, permisos, errores y detalles de despliegue:
[`docs/contratos/hu03-extra-endpoints.md`](../contratos/hu03-extra-endpoints.md).

## Cómo preparar y probar

Después de instalar dependencias y con `DATABASE_URL` configurada:

```bash
npm run prisma:deploy
npm run prisma:generate
npm run db:seed:rewards
npx tsc --noEmit
npm run build
npm run lint
npm test
```

Para integración, usar una base PostgreSQL 18 exclusiva para pruebas, con todas
las migraciones aplicadas:

```bash
npx vitest run --config vitest.config.e2e.ts test/db-hu03-extra.e2e-spec.ts
```

Los siguientes comandos crean bases temporales independientes, verifican el
esquema y eliminan únicamente esas bases al finalizar. `DATABASE_URL` debe
corresponder a un usuario con permiso para crear bases:

```bash
node scripts/test-e2e-isolated.mjs
npm run test:migrations
```

## Resultados registrados: 14 de noviembre de 2026

Verificación local con Prisma Client 7.10 y PostgreSQL **18.6**:

- [x] `npx tsc --noEmit`: completado correctamente.
- [x] `npm run build`: completado correctamente.
- [x] Pruebas unitarias globales: **263/263 aprobadas**, 22 suites, incluidas 22 nuevas de cálculo, validación y permisos de recompensas.
- [x] E2E de HU-03 extra: **23/23 aprobadas**, con AppModule, JWT, Prisma y PostgreSQL reales.
- [x] Los E2E comprueban consultas y filtros, paginación, estados/nulos válidos, roles y aislamiento por sucursal/cliente, regalos visibles en cocina, importe neto/comprobante/puntos, reintentos y protección del saldo concurrente.
- [x] Las pruebas fuerzan coincidencia mediante `pg_sleep(0.2)` antes de insertar el canje. Un trigger de fallo al final comprueba el rollback completo.
- [x] Migraciones: aplicar/revertir/reaplicar y ciclo completo aprobados. Se verifica backfill sin cambiar el estado de mesas, FK entre sucursales, conservación de beneficios heredados y rechazo de reversión que perdería personalizaciones.
- [x] Seeds repetidos en otra base temporal: sin duplicar productos/mesas ni sobrescribir precio, disponibilidad o salón personalizado.
- [x] Lint global: salida 0, con **ocho advertencias preexistentes** en otros archivos. No se presenta como libre de advertencias.
- [x] Formato de los archivos nuevos/modificados y `git diff --check`: sin incidencias.
- [x] Suite E2E global ejecutada: **363 aprobadas y 2 fallidas**, 26 suites aprobadas y una fallida, sin casos omitidos.
- [x] Los mismos fallos se reprodujeron en una copia limpia de `develop` **f6433cd**, con su propio Prisma Client y otra base temporal: **14 aprobadas y 2 fallidas** en pedidos.
- [ ] E2E global completamente verde: persisten los fallos previos de `pickupAt` y `AT_COUNTER` en `test/db-orders.e2e-spec.ts`.
- [ ] Frontend y CI: no ejecutados ni verificados en esta entrega.

Los errores `HU03 rollback test` y `BE09 rollback test` en los logs son fallos
provocados para comprobar atomicidad. Sus casos pasaron. No se omitieron pruebas
para presentar un resultado global satisfactorio.

La recuperación utilizó PostgreSQL 18 local y el generador oficial JavaScript
de Prisma. No se publicó ni modificó la configuración reutilizable del entorno.

## Alcance y decisiones

- Se completó primero la implementación funcional; las pruebas se añadieron al finalizarla.
- Una recompensa por pedido. Los datos de coste, porcentaje y propietario no se aceptan desde HTTP.
- Los productos requieren disponibilidad en el catálogo de la sucursal. El seed conserva precios, disponibilidad y salones personalizados.
- Se mantiene la acreditación existente de puntos por pagos aprobados.
- Los beneficios/canjes heredados conservan sus datos; las nuevas reglas se aplican a recompensas con tipo configurado.
- Un pago rechazado puede reintentarse con la recompensa ya aplicada. No se incorporan cancelaciones/reembolsos de canjes ni un flujo nuevo de caja de salón.
- El control de inventario mantiene el alcance existente del proyecto; el canje valida disponibilidad del catálogo.
- No se añade CRUD de mesas/salones ni pantallas frontend.

## Integración

- Rama origen: `feat/BE-03-extra-endpoints`.
- Rama destino: `develop`.
- Base: `f6433cd`.
- Requiere aplicar ambas migraciones y regenerar Prisma Client antes de iniciar.
- Se necesitan los productos de recompensa en el catálogo de cada sucursal; `npm run db:seed:rewards` prepara los faltantes sin reiniciar datos existentes.
- El autor crea el PR y asigna a la persona revisora.
