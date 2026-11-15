# fix: respetar modalidad y retiro del pedido y corregir arranque y tipado

## Qué cambia

- `POST /api/v1/orders` persiste `AT_COUNTER` cuando el cliente lo solicita. `ONLINE` es el valor predeterminado únicamente cuando no se indica modalidad, conforme al contrato existente.
- Se guarda `pickupAt` veinte minutos después del instante de creación del pedido. La respuesta devuelve la fecha persistida como ISO 8601 UTC.
- Los reintentos devuelven el mismo pedido, modalidad, total y fecha de retiro, incluso si cambian precios o se cierra la sucursal. Omitir modalidad y enviar `ONLINE` explícito conservan la misma identidad de operación.
- `GET /api/v1/orders/me` utiliza `Prisma.Decimal | null` y `toFixed(2)` directamente. Se elimina una conversión genérica desde `unknown`, así como el cast que ocultaba el tipado del resultado del repositorio.
- Se elimina la exportación de `sales-date-range.spec.ts` desde el módulo de reportes, que incorporaba Vitest al código compilado e impedía arrancar Node fuera del runner de pruebas.
- El build añade una comprobación de imports y archivos compilados que rechaza referencias a pruebas o Vitest en runtime.
- Se corrigen ocho advertencias previas del linter: importe de pedidos propios, referencia de método para inspeccionar metadata, cinco `await` sobre firmas JWT síncronas y una constante sin uso.

## Por qué

En `develop`, el repositorio fijaba `paymentMode: 'ONLINE'` e ignoraba la modalidad validada por el DTO y normalizada por el servicio. Además, omitía `pickupAt`, aunque Swagger y el contrato del pedido para llevar ya prometían una estimación de veinte minutos.

Antes de corregirlo se reprodujeron los dos fallos en PostgreSQL: **14 pruebas aprobadas y 2 fallidas**, de los 16 casos existentes de creación de pedidos. La suite ampliada de creación ahora aprueba **18 de 18**.

La corrección principal es:

```typescript
const PICKUP_ESTIMATE_MS = 20 * 60 * 1000;
```

Dentro de `tx.order.create({ data: { ... } })`:

```typescript
paymentMode: input.paymentMode ?? 'ONLINE',
pickupAt: new Date(Date.now() + PICKUP_ESTIMATE_MS),
```

## Archivos relevantes

| Archivo                                                | Cambio                                                                                |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `src/orders/repositories/orders.repository.ts`         | Persistencia de modalidad y retiro estimado.                                          |
| `src/accounts-orders/repositories/order.repository.ts` | Resultado monetario tipado y eliminación del cast.                                    |
| `src/accounts-orders/services/my-orders.service.ts`    | Serialización decimal directa.                                                        |
| `src/reports/services/index.ts`                        | Retiro de la exportación de un test.                                                  |
| `scripts/check-runtime-imports.mjs`, `package.json`    | Verificación automática del código de runtime durante el build.                       |
| `test/db-orders.e2e-spec.ts`                           | Fecha persistida, modalidad por defecto e idempotencia en ambas modalidades.          |
| `test/db-my-orders.e2e-spec.ts`                        | Importes decimales, histórico nulo y firmas JWT síncronas.                            |
| `src/catalog/menu/services/available-dishes.spec.ts`   | Inspección explícita de metadata sin referencia de método potencialmente desasociada. |
| `test/db-sales-reports.e2e-spec.ts`                    | Eliminación de constante sin uso.                                                     |

## Cómo probarlo

Con dependencias instaladas, Prisma Client generado, variables de entorno configuradas y `DATABASE_URL` apuntando a un PostgreSQL exclusivo para pruebas:

```bash
npx tsc --noEmit
npm run build
npm run lint
npm test
node scripts/test-e2e-isolated.mjs
```

El último comando crea una base temporal, aplica todas las migraciones, ejecuta la suite E2E y elimina únicamente esa base al terminar. El usuario de PostgreSQL utilizado para este comando necesita permiso para crear bases de prueba.

Para repetir solamente las suites de pedidos contra una base exclusiva previamente migrada:

```bash
npx vitest run --config ./vitest.config.db.ts test/db-orders.e2e-spec.ts test/db-my-orders.e2e-spec.ts
```

## Resultados registrados

Validación local del **14 de noviembre de 2026**, zona `America/El_Salvador`; los logs del entorno utilizan UTC.

- [x] Prisma Client regenerado con el generador oficial disponible localmente, sin desactivar la verificación TLS ni alterar las dependencias.
- [x] `npx tsc --noEmit`: completado correctamente.
- [x] `npm run build`: completado correctamente, incluida la comprobación de imports y artefactos de runtime.
- [x] `npm run lint`: **0 errores y 0 advertencias**.
- [x] `npm test`: **263/263 pruebas aprobadas**, 22 suites.
- [x] Suites específicas de pedidos: **27/27 aprobadas**, 18 de creación y 9 de pedidos propios, con PostgreSQL real.
- [x] Suite E2E global: **363/363 aprobadas**, 27 suites, sin fallos ni casos omitidos. Los 27 casos específicos están incluidos en este total.
- [x] Arranque del servidor compilado mediante `node dist/main.js`, fuera de Vitest, y consulta HTTP al health check: correctos.
- [ ] CI en GitHub: no se verificó una ejecución remota; los resultados anteriores son locales.

Los errores emitidos por las pruebas que fuerzan rollback mediante triggers son intencionados y sus casos pasaron. No se omiten pruebas ni se relajan las expectativas que detectaban los dos fallos originales.

## Compatibilidad e integración

- Rama origen: `fix/backend-polish`.
- Rama destino: `develop`.
- Base: `c11f843`.
- Se utilizan los endpoints, campos, migraciones y dependencias existentes. No se añade migración ni se modifica el lockfile.
- La fecha de retiro es una estimación fija por pedido, no una garantía de preparación ni un cálculo de capacidad de cocina.
- La corrección se aplica a los pedidos nuevos. Las modalidades y fechas de pedidos históricos no se reconstruyen a partir de suposiciones; se conserva el contrato nullable existente.
- El autor crea el PR y selecciona a la persona revisora.

Matriz de validación: [QA de correcciones](https://github.com/Aisack23/be_noodlevolt_is_2026/blob/fix/backend-polish/docs/qa/BACKEND-polish.md).
