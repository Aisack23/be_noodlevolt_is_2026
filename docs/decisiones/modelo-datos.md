# Modelo de datos: Anexo A y catálogo/pedidos

## Alcance y equivalencias

DB-A.1.1 define usuarios, roles, sucursales y mesas. Se mantienen modelos y enums en inglés; el contrato funcional de la HU usa las siguientes equivalencias.

| UserRole          | HU                   |
| ----------------- | -------------------- |
| CLIENT            | CLIENTE              |
| WAITER            | MESERO               |
| COOK              | COCINA               |
| CASHIER           | CAJERO               |
| INVENTORY_MANAGER | ENCARGADO_INVENTARIO |
| BRANCH_ADMIN      | GERENTE              |
| GENERAL_MANAGER   | GERENTE_GENERAL      |

| TableStatus              | HU                                               |
| ------------------------ | ------------------------------------------------ |
| AVAILABLE                | LIBRE                                            |
| OCCUPIED                 | OCUPADA                                          |
| NEEDS_CLEANING           | POR_LIMPIAR                                      |
| RESERVED, OUT_OF_SERVICE | Estados adicionales sin equivalencia en DB-A.1.1 |

## Integridad

- `users_role_branch_check`: CLIENT y GENERAL_MANAGER deben tener `branch_id IS NULL`; todo el personal debe tener sucursal. Se compara `role::text` para que el CHECK no dependa de conversiones entre valores del enum al evolucionar el tipo. El FK existente exige una sucursal real. Borrar una sucursal con personal asignado es rechazado: el SET NULL del FK no puede dejarlo sin sucursal.
- `tables_capacity_check`: capacidad estrictamente mayor que cero.
- `branches_name_key`: nombre único de sucursal. La comparación conserva las reglas de texto de PostgreSQL; no se añade normalización de mayúsculas.
- `users_email_key`, FK de usuarios y UNIQUE de número de mesa por sucursal se mantienen.
- INVENTORY_MANAGER identifica al responsable de inventario; NEEDS_CLEANING distingue una mesa cobrada de una mesa disponible, conforme a BE-6.1.2 y BE-A.3.1.

La migración rechaza datos anteriores inválidos; no reasigna personas ni renombra sucursales automáticamente. Los CHECK se agregan manualmente al SQL generado por Prisma.

## Catálogo y pedidos: DB-1.1.1 y DB-2.1.1

| Modelo / campo       | Restricción y justificación                                                         |
| -------------------- | ----------------------------------------------------------------------------------- |
| Dish.name            | VARCHAR(100), según DB-1.1.1                                                        |
| Dish.description     | VARCHAR(300), opcional                                                              |
| Dish.price           | NUMERIC(8,2) y CHECK `dishes_price_check`: mayor que cero                           |
| Dish.branchId        | UUID obligatorio, FK `dishes_branch_id_fkey` a branches con DELETE RESTRICT         |
| Dish.branchId + name | UNIQUE `dishes_branch_id_name_key`: permite el mismo nombre en sucursales distintas |
| OrderItem.unitPrice  | NUMERIC(8,2), snapshot del precio al pedir                                          |
| OrderItem.quantity   | CHECK `order_items_quantity_check`: entero de 1 a 20, inclusivo                     |
| OrderItem.note       | VARCHAR(200) opcional; el tipo limita la longitud, sin CHECK adicional              |
| Order.status         | Se agrega PENDING_PAYMENT; el default sigue siendo PENDING                          |

La pertenencia de platillos a sucursal permite validar el catálogo y evitar pedidos con platillos de otra sucursal. La FK conserva la sucursal mientras exista un platillo que la use. Como ajuste mínimo exigido por el schema, `CreateDishData` agrega únicamente `branchId: string`, correspondiente a `Branch.id String @db.Uuid`; permite compilar la creación existente con el nuevo campo obligatorio. No cambia consultas ni lógica del repositorio. Este ajuste debe explicarse a Diego en el PR; el filtrado por sucursal y las reglas de BE-1.1.1 siguen perteneciendo a esa task.

| Enum            | Inglés                                        | HU                                             |
| --------------- | --------------------------------------------- | ---------------------------------------------- |
| DishStatus      | AVAILABLE / SOLD_OUT / DISABLED               | DISPONIBLE / AGOTADO / DESHABILITADO           |
| OrderStatus     | PENDING_PAYMENT / PENDING                     | PENDIENTE_PAGO / PENDIENTE                     |
| OrderStatus     | IN_PREPARATION / READY / DELIVERED / CANCELED | EN_PREPARACION / LISTO / ENTREGADO / CANCELADO |
| OrderStatus     | CONFIRMED                                     | Sin equivalente; pregunta abierta              |
| OrderItemStatus | PENDING / IN_PREPARATION / READY / DELIVERED  | PENDIENTE / EN_PREPARACION / LISTO / ENTREGADO |
| AccountStatus   | OPEN / CLOSED                                 | ABIERTA / CERRADA                              |
| OrderType       | DINE_IN / TAKEOUT                             | SALA / LLEVAR                                  |

PENDING_PAYMENT representa el pedido para llevar pagado en línea antes de su cobro; BE-6.2.1 lo pasa a PENDING y cocina lo excluye mientras no se pague. No sustituye el estado del pago.

La migración exige dishes vacía al agregar branch_id NOT NULL. Para datos existentes hace falta una asignación explícita acordada antes de migrar; no se deduce una sucursal ni se borran datos. También se rechazan textos o importes previos que no quepan en los tipos nuevos.

## Decisión del equipo: operation_id

Se conserva `operationId String @unique @default(uuid())`, obligatorio. El UUID por defecto lo genera el cliente Prisma, no PostgreSQL. Identifica también pedidos de sala sin clave externa. En BE-2.2.1 el servicio debe exigir Idempotency-Key, pasar explícitamente el mismo UUID a `operationId` y reutilizarlo en reintentos; generar otro UUID por solicitud no garantiza idempotencia. La restricción UNIQUE y la resolución transaccional de colisiones permiten devolver el pedido existente, también bajo concurrencia. Hacerlo nullable no mejora esa garantía.

## Preguntas abiertas

¿Se eliminan CONFIRMED de OrderStatus, DELIVERY de OrderType y CANCELED de AccountStatus y OrderItemStatus para limitar los conjuntos a DB-2.1.1? La decisión sigue abierta; se conservan esos valores. También queda por acordar el uso de RESERVED y OUT_OF_SERVICE en mesas. No se eliminan esos estados ni se definen reglas de otras épicas.

## Datos iniciales

`npm run db:seed:base` ejecuta el seed independiente del Anexo A. Hace upsert de sucursales por nombre (Centro y Santa Tecla), de seis mesas por `(branchId, number)` y de un usuario por cada rol mediante email. Mesero y cocina pertenecen a Centro; caja, inventario y gerente a Santa Tecla. Cliente y gerente general no tienen sucursal. Cada usuario nuevo incluye nombre, apellido y hash bcrypt de la clave demo. Los upserts no sobrescriben cambios posteriores ni contraseñas. Las escrituras forman una transacción; el seed heredado no se modifica.

`npm run db:seed:catalog` ejecuta primero el seed base y agrega categorías Entradas, Platos fuertes, Bebidas y Postres mediante upsert por nombre, y ocho platillos por sucursal mediante `(branchId, name)`. Son dos platillos por categoría con precios positivos expresados como strings decimales. Las inserciones de catálogo forman una transacción; los upserts preservan precios y estados modificados después. El seed base sigue siendo independiente del catálogo.

## Reversión

`down.sql` se genera con `prisma migrate diff --from-schema <posterior> --to-schema <anterior> --script` y se completa con los CHECK y protecciones de enums. Rechaza usuarios INVENTORY_MANAGER y mesas NEEDS_CLEANING todavía en uso. En una transacción retira los CHECK y UNIQUE propios, reconstruye los enums anteriores y restaura sus defaults. No convierte ni elimina filas.

Se revierte de la migración más reciente a la más antigua, solo sobre una base en la versión correspondiente:

```powershell
npx prisma db execute --file prisma/migrations/20261102023859_base_anexo_a/down.sql
npx prisma db execute --file prisma/migrations/20261102023859_base_anexo_a/migration.sql
```

`db execute` no actualiza `_prisma_migrations`: para completar el ciclo se reaplica el SQL explícito. `migrate deploy` no reaplica una migración ya registrada como exitosa. Hasta restaurarla existe drift; no se debe borrar historial ni resetear datos para ocultarlo.

La migración de catálogo/pedidos se revierte antes que la del Anexo A. Su down restaura los tipos previos, quita FK/UNIQUE y CHECK propios y reconstruye OrderStatus en todas sus columnas, incluido el historial. Rechaza platillos existentes para no perder su sucursal y rechaza PENDING_PAYMENT en pedidos o historial. No cambia filas a otro estado automáticamente.

```powershell
npx prisma db execute --file prisma/migrations/20261102025141_catalogo_pedidos_hu/down.sql
npx prisma db execute --file prisma/migrations/20261102025141_catalogo_pedidos_hu/migration.sql
```

## Verificación reproducible

Con DATABASE_URL apuntando a una base de pruebas del PostgreSQL de Docker:

```bash
npm run prisma:deploy
npm run prisma:generate
npm run db:seed:base
npm run db:seed:base
npm run db:seed:catalog
npm run db:seed:catalog
npm run test:db
npm run test:migrations
```

Los tests de integración insertan fixtures dentro de una transacción y hacen rollback por caso; comprueban código SQLSTATE y nombre de CHECK, UNIQUE o FK con `toMatchObject({ code, constraint })`. Incluyen rol inválido, correo duplicado y estado de platillo inválido. Los errores de enum (22P02), longitud (22001), precisión (22003) y NOT NULL (23502) no tienen nombre de constraint en PostgreSQL: se comprueba que sea undefined.

El verificador de migraciones necesita CREATEDB. Crea una base aleatoria, aplica las migraciones heredadas y prueba aplicar/revertir/reaplicar cada migración con down.sql. Compara tipos, columnas, defaults, índices, CHECK, FK y enums, y repite el ciclo conjunto. Comprueba el rechazo sin pérdida de datos de reversiones protegidas. Elimina solo su base temporal y no modifica la base de DATABASE_URL.
