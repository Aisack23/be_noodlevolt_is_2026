# DB-07: acumulación de puntos por pago

## Equivalencias con HU-07 / DB-07

| PDF             | Modelo Prisma           | Tabla y campos                                                                               |
| --------------- | ----------------------- | -------------------------------------------------------------------------------------------- |
| LoyaltyAccount  | LoyaltyAccount          | `loyalty_accounts`: `user_id`, `points`, `created_at`, `updated_at`                          |
| LoyaltyMovement | PointsMovement          | `points_movements`: campos existentes, sin renombrarlos                                      |
| Cliente         | User con role CLIENT    | `users`; `PointsMovement.customerId` identifica al mismo usuario que `LoyaltyAccount.userId` |
| APROBADO        | PaymentStatus.PAID      | `payments.status = 'PAID'`                                                                   |
| RECHAZADO       | PaymentStatus.REJECTED  | `payments.status = 'REJECTED'`                                                               |
| Acumulación     | PointsMovementType.EARN | Puntos estrictamente positivos                                                               |

Se reutiliza `PointsMovement` porque `src/customer-features/repositories/points-movement.repository.ts` ya usa sus campos y calcula el saldo mediante la suma de `points`. Canjes y ajustes conservan su signo; un CHECK global `points >= 0` sobre movimientos rompería esa representación. `PointsRule`, `Benefit`, `Redemption` y los contratos de pagos permanecen iguales.

## Integridad y responsabilidad de BE-07

`LoyaltyAccount.userId` es PK y FK a `users.id`, con DELETE RESTRICT y UPDATE CASCADE. Cada usuario tiene como máximo una cuenta; BE-07 puede crearla al necesitarla. `points` es INT NOT NULL DEFAULT 0 con CHECK `loyalty_accounts_points_nonnegative` (`points >= 0`). Ambas fechas son TIMESTAMPTZ(6), con default `now()`; Prisma mantiene `updatedAt` mediante `@updatedAt`. Escrituras SQL directas deben actualizar `updated_at` explícitamente.

`points_movements_earn_positive` exige `points > 0` y `payment_id IS NOT NULL` para EARN. El índice único parcial `points_movements_one_earn_per_payment` sobre `payment_id WHERE type = 'EARN'` impide otra acreditación del mismo pago, incluso para otro cliente o bajo concurrencia. No impide ajustes ni canjes asociados a ese pago. EARN sin pago se rechaza mediante el CHECK; otros tipos pueden conservar `payment_id` nulo. El índice vive en SQL y se conserva la relación existente `Payment.pointsMovements`.

Las FK existentes de movimientos conservan DELETE RESTRICT para cliente, pago y canje, y DELETE SET NULL para la regla de puntos. No se añade otra FK entre cuenta y movimiento ni se exige una cuenta a consumidores existentes.

BE-07 garantiza **no acreditar pagos rechazados** y la **coherencia entre saldo y movimientos en una transacción**. Debe comprobar PAID, titularidad y las demás condiciones de HU-07; calcular `floor(totalPaid)` con aritmética decimal; omitir el movimiento cuando el resultado sea cero; registrar el EARN y aumentar el saldo atómicamente. Un reintento debe resolver la colisión única sin incrementar otra vez el saldo. Para BE-07, `findByPayment` debe filtrar por `type: 'EARN'`, porque ajustes y canjes pueden referenciar el mismo pago. Un CHECK no puede consultar otra tabla: DB-07 no introduce triggers ni implementa esa lógica de negocio. Las pruebas de DB-07 comprueban restricciones y rollback de escrituras, sin afirmar que BE-07 ya esté implementado.

## Migración, datos existentes y reversión

`20261108120000_loyalty_accounts` se ejecuta en una transacción y bloquea escrituras del historial durante la validación y el backfill. Inicializa una cuenta por usuario con movimientos, con la suma firmada y sin modificar el historial. Las fechas de la cuenta reflejan la migración. Duplicados EARN por pago, EARN sin pago, EARN de cero o negativos, sumas negativas o desbordamientos de INT abortan toda la migración; no se eliminan ni normalizan datos incompatibles.

El `down.sql` bloquea la tabla y lanza RAISE EXCEPTION si existe cualquier cuenta, incluso de cero puntos: eliminarla perdería su saldo o auditoría. Sin cuentas elimina únicamente la tabla, el CHECK y el índice propios; conserva todos los movimientos. No borra filas para forzar una reversión. Como otros `down.sql` del repositorio, su ejecución manual no actualiza `_prisma_migrations`.

## Seed y verificación

`npm run db:seed:loyalty` ejecuta el seed base y luego el de lealtad. Usa la cuenta real `demo@example.com`, inicializa su cuenta desde la suma de movimientos cuando falta e inserta una regla demo de `1.00` punto por dólar mediante UUID estable. No crea acreditaciones porque aún no hay seed de pagos PAID; tampoco crea pagos ficticios. Repetirlo conserva saldos, fechas y cambios posteriores de la regla. La regla demo no impone una nueva política de vigencia sobre las reglas existentes; su selección corresponde al backend.

Con DATABASE_URL apuntando a la base propia de pruebas del PostgreSQL 18 de Docker:

```powershell
npx prisma generate
npx prisma migrate deploy
npm run db:seed:loyalty
npm run lint
npm run build
npm test
npm run test:db
npm run test:migrations
npm run test:e2e
```

`test/db-loyalty.e2e-spec.ts` verifica PK, FK, DELETE RESTRICT, CHECK, fechas, unicidad parcial, rollback del incremento ante un pago duplicado y repetibilidad del seed. `test/db-loyalty-migrations.e2e-spec.ts` aplica el historial anterior en esquemas temporales propios dentro de DATABASE_URL y verifica backfill, aplicación/reversión/reaplicación y rechazo sin cambios parciales. Solo elimina sus esquemas `db07_<uuid>`. Además, `checkRefusal` del verificador de migraciones exige P0001 al revertir con una cuenta y comprueba tras ROLLBACK que se conservan saldo, fechas y schema. Los verificadores heredados de pagos y migraciones crean y eliminan bases temporales propias; no modifican otras bases existentes.

El [diagrama ER](diagrama-er.md) incluye cuenta, movimientos y sus referencias.

## Resultado local (2026-11-08)

Verificado en `si_be_boilerplate_test_db07`, PostgreSQL 18 del Docker Compose existente, puerto local 5433:

| Comando                   | Resultado                                            |
| ------------------------- | ---------------------------------------------------- |
| `npm run lint`            | Aprobado; dos advertencias existentes fuera de DB-07 |
| `npm run build`           | Aprobado                                             |
| `npm test`                | 140 aprobadas                                        |
| `npm run test:db`         | 233 aprobadas, 2 fallos ajenos en pedidos            |
| `npm run test:migrations` | Aprobado, incluido el ciclo completo de DB-07        |
| `npm run test:e2e`        | 234 aprobadas, los mismos 2 fallos ajenos            |

Las 22 pruebas nuevas de DB-07 pasan en ambas suites. Los fallos existentes están en `test/db-orders.e2e-spec.ts`: el caso ONLINE recibe `pickupAt=null` y el caso AT_COUNTER recibe `paymentMode=ONLINE`. `src/orders/repositories/orders.repository.ts` ya fija ONLINE al crear el pedido y omite pickupAt; tanto ese archivo como las pruebas de pedidos son idénticos a origin/develop y no se modificaron en DB-07. Las advertencias de lint están en `src/catalog/menu/services/available-dishes.spec.ts` y `test/db-simulated-payments.e2e-spec.ts`.
