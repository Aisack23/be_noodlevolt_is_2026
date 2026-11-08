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

| Modelo / campo        | Restricción y justificación                                                         |
| --------------------- | ----------------------------------------------------------------------------------- |
| Category.displayOrder | INTEGER NOT NULL DEFAULT 0, columna display_order: orden de presentación del menú   |
| Dish.name             | VARCHAR(100), según DB-1.1.1                                                        |
| Dish.description      | VARCHAR(300), opcional                                                              |
| Dish.price            | NUMERIC(10,2) según DB-01 y CHECK `dishes_price_check`: mayor que cero              |
| Dish.branchId         | UUID obligatorio, FK `dishes_branch_id_fkey` a branches con DELETE RESTRICT         |
| Dish.branchId + name  | UNIQUE `dishes_branch_id_name_key`: permite el mismo nombre en sucursales distintas |
| OrderItem.unitPrice   | NUMERIC(8,2), snapshot del precio al pedir                                          |
| OrderItem.quantity    | CHECK `order_items_quantity_check`: entero de 1 a 20, inclusivo                     |
| OrderItem.note        | VARCHAR(200) opcional; el tipo limita la longitud, sin CHECK adicional              |
| Order.status          | Se agrega PENDING_PAYMENT; el default sigue siendo PENDING                          |

La pertenencia de platillos a sucursal permite validar el catálogo y evitar pedidos con platillos de otra sucursal. La FK conserva la sucursal mientras exista un platillo que la use. Como ajuste mínimo exigido por el schema, `CreateDishData` agrega únicamente `branchId: string`, correspondiente a `Branch.id String @db.Uuid`; permite compilar la creación existente con el nuevo campo obligatorio. No cambia consultas ni lógica del repositorio. El filtrado por sucursal y las reglas de BE-1.1.1 siguen perteneciendo a esa task.

| Enum            | Inglés                                        | HU                                             |
| --------------- | --------------------------------------------- | ---------------------------------------------- |
| DishStatus      | AVAILABLE / SOLD_OUT / DISABLED               | DISPONIBLE / AGOTADO / DESHABILITADO           |
| OrderStatus     | PENDING_PAYMENT / PENDING                     | PENDIENTE_PAGO / PENDIENTE                     |
| OrderStatus     | IN_PREPARATION / READY / DELIVERED / CANCELED | EN_PREPARACION / LISTO / ENTREGADO / CANCELADO |
| OrderStatus     | CONFIRMED                                     | Sin equivalente; pregunta abierta              |
| OrderItemStatus | PENDING / IN_PREPARATION / READY / DELIVERED  | PENDIENTE / EN_PREPARACION / LISTO / ENTREGADO |
| AccountStatus   | OPEN / CLOSED                                 | ABIERTA / CERRADA                              |
| Notification.type | PEDIDO_LISTO | PEDIDO_LISTO: aviso interno de pedido listo (HU-09) |
| OrderType       | DINE_IN / TAKEOUT                             | SALA / LLEVAR                                  |

| PaymentMode | HU       |
| ----------- | -------- |
| ONLINE      | EN_LINEA |
| AT_COUNTER  | EN_CAJA  |

| BranchConfig.isOpen | HU      |
| ------------------- | ------- |
| true                | ABIERTA |
| false               | CERRADA |

El detalle de `BranchConfig` está en [parametros-sucursal.md](parametros-sucursal.md).

PENDING_PAYMENT representa el pedido para llevar pagado en línea antes de su cobro; BE-6.2.1 lo pasa a PENDING y cocina lo excluye mientras no se pague. No sustituye el estado del pago.

BE-2.2.1 agrega `Order.paymentMode` como `payment_mode` nullable y el enum `PaymentMode`. El CHECK `orders_type_payment_mode_check` exige modalidad para TAKEOUT y la prohíbe para DINE_IN; compara `type::text` para no acoplarse a futuras reconstrucciones de `order_type`. El valor adicional DELIVERY queda sin regla nueva mientras su permanencia siga abierta. DB-6.2.1, a cargo de Diego, construirá encima los demás campos de pago sin redefinir `paymentMode`.

La migración exige dishes vacía al agregar branch_id NOT NULL. Para datos existentes hace falta una asignación explícita acordada antes de migrar; no se deduce una sucursal ni se borran datos. También se rechazan textos o importes previos que no quepan en los tipos nuevos.

## Categorías y platillos por sucursal: DB-01

| Modelo / campo                     | Restricción y justificación                                                        |
| ---------------------------------- | ---------------------------------------------------------------------------------- |
| Category.branchId                  | UUID obligatorio, FK `categories_branch_id_fkey` con DELETE RESTRICT               |
| Category.branchId + name           | UNIQUE `categories_branch_id_name_key`: reemplaza el UNIQUE global de nombre       |
| Category.branchId + id             | UNIQUE `categories_branch_id_id_key`: destino de la FK compuesta de Dish           |
| Dish.branchId + categoryId         | FK `dishes_branch_id_category_id_fkey` e índice `dishes_branch_id_category_id_idx` |
| Dish.isAvailable                   | BOOLEAN NOT NULL DEFAULT true                                                      |
| Dish.isDeleted                     | BOOLEAN NOT NULL DEFAULT false                                                     |
| Category/Dish createdAt, updatedAt | TIMESTAMPTZ(6) NOT NULL DEFAULT now; `@updatedAt` actualiza updatedAt desde Prisma |

**FK compuesta.** Al ser las categorías por sucursal, un FK simple permitiría un platillo de una sucursal en una categoría de otra. La FK compuesta lo rechaza en la base con SQLSTATE 23503; `dishes_branch_id_fkey` se conserva y sigue reportando una sucursal inexistente. Borrar una categoría con platillos o una sucursal con categorías responde 23001 (`restrict_violation`) en PostgreSQL 18, por el DELETE RESTRICT.

**Copia de categorías existentes.** La migración no exige tablas vacías para no obligar al equipo a resetear sus bases. Copia cada categoría a cada sucursal, con su nombre, orden, descripción y estado, también las que no tienen platillos; pasa cada platillo a la copia de su sucursal y borra la categoría global. Los ID de categoría cambian. Si hay categorías y ninguna sucursal, la migración falla sin cambios parciales, porque borrarlas perdería datos.

**Dish.status se conserva.** El menú lo lee hasta BE-01 (Isaac) y `takeout-orders` también depende de él. Los datos se migran así:

| status    | isAvailable | isDeleted |
| --------- | ----------- | --------- |
| AVAILABLE | true        | false     |
| SOLD_OUT  | false       | false     |
| DISABLED  | false       | false     |

Hasta que BE-01 cambie la lectura, cambiar solo `isAvailable` no modifica el menú, y no hay CHECK que ate ambos campos: quien escriba platillos debe actualizarlos juntos. BE-01 filtrará `isAvailable=false`, lo que ocultará los agotados que hoy se muestran. Retirar `status` queda para una PR posterior acordada con el equipo.

**Precio.** DB-01 fija `Decimal(10,2)`; el documento de 11 HU no indica un máximo de negocio. Por eso `dishes_price_check` sigue exigiendo solo un valor mayor que cero y el límite efectivo es el del tipo: 99,999,999.99. `OrderItem.unitPrice` sigue en NUMERIC(8,2) porque pertenece a DB-02: hasta alinearlo, un precio de 1,000,000.00 o más no se puede copiar a una línea de pedido.

La respuesta del menú conserva el formato de `develop`: string con dos decimales (`"8.50"`), como se describe en [menu-publico.md](menu-publico.md). El diagrama está en [diagrama-er.md](diagrama-er.md).

## Decisión del equipo: operation_id

Se conserva `operationId String @unique @default(uuid())`, obligatorio. El UUID por defecto lo genera el cliente Prisma, no PostgreSQL. Identifica también pedidos de sala sin clave externa. En BE-2.2.1 el servicio debe exigir Idempotency-Key, pasar explícitamente el mismo UUID a `operationId` y reutilizarlo en reintentos; generar otro UUID por solicitud no garantiza idempotencia. La restricción UNIQUE y la resolución transaccional de colisiones permiten devolver el pedido existente, también bajo concurrencia. Hacerlo nullable no mejora esa garantía.

## Preguntas abiertas

¿Se eliminan CONFIRMED de OrderStatus, DELIVERY de OrderType y CANCELED de AccountStatus y OrderItemStatus para limitar los conjuntos a DB-2.1.1? La decisión sigue abierta; se conservan esos valores. También queda por acordar el uso de RESERVED y OUT_OF_SERVICE en mesas. No se eliminan esos estados ni se definen reglas de otras épicas.

## Datos iniciales

`npm run db:seed:base` ejecuta el seed independiente del Anexo A. Hace upsert de sucursales por nombre (Centro y Santa Tecla), de seis mesas por `(branchId, number)` y de un usuario por cada rol mediante email. Mesero y cocina pertenecen a Centro; caja, inventario y gerente a Santa Tecla. Cliente y gerente general no tienen sucursal. Cada usuario nuevo incluye nombre, apellido y hash bcrypt de la clave demo. Los upserts no sobrescriben cambios posteriores ni contraseñas. Las escrituras forman una transacción; el seed heredado no se modifica.

`npm run db:seed:catalog` ejecuta primero el seed base y agrega en cada sucursal las categorías Entradas, Platos fuertes, Bebidas y Postres mediante upsert por `(branchId, name)`, y diez platillos mediante `(branchId, name)`. Asigna y actualiza su displayOrder a 1, 2, 3 y 4 respectivamente, incluso en categorías existentes. Los precios son positivos y se expresan como strings decimales. Nueve platillos están disponibles; Arroz frito cuesta 6.50 en Centro y 7.00 en Santa Tecla para probar precios por sucursal, y Sopa wonton queda DISABLED con `isAvailable=false` para probar que no aparece. Las inserciones de catálogo forman una transacción; los upserts preservan precios y estados de platillos modificados después. El seed base sigue siendo independiente del catálogo.

El orden de categorías del menú es displayOrder, nombre e ID como desempates. El campo no es único ni tiene CHECK de positividad: categorías adicionales pueden conservar el default 0 y compartir orden. La migración `20261102055433_orden_presentacion_categorias` agrega el campo sin modificar migraciones anteriores; las categorías existentes reciben 0 hasta ejecutar el seed o asignarles un orden explícito.

## Reseñas y validación de rating

La nueva migración `20261106235931_resenas_check_rating` agrega la restricción `reviews_rating_range` sobre `reviews.rating` con `CHECK (rating BETWEEN 1 AND 5)`. No se introduce ningún campo nuevo para promedio ni agregación: el valor promedio se calcula en agregación con `AVG(rating)` sobre `reviews` y no se guarda como columna derivada. El documento de decisiones mantiene el modelo simple y evita campos redundantes.

`reviews.order_id` sigue siendo único (`reviews_order_id_key`), de modo que cada pedido puede tener, como máximo, una reseña. La combinación permite distinguir pedidos `DELIVERED` con y sin reseña, y además soporta el caso `PENDING` sin reseña, sin redefinir la entidad ni agregar una nueva tabla por estado.

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

### Reversión del orden de categorías

Para revertir el orden de categorías, primero se ejecuta su `down.sql`, antes de las migraciones del catálogo y Anexo A. Quita únicamente display_order y pierde sus valores configurados; al reaplicar el SQL se inicializa a 0, y el seed restablece los valores de las cuatro categorías de prueba:

```powershell
npx prisma db execute --file prisma/migrations/20261102055433_orden_presentacion_categorias/down.sql
npx prisma db execute --file prisma/migrations/20261102055433_orden_presentacion_categorias/migration.sql
```

### Reversión de la modalidad de pago

La migración `20261102075333_takeout_payment_mode` debe revertirse antes de las demás migraciones propias. Su `down.sql`, generado con `prisma migrate diff --script` y completado con el CHECK, elimina `payment_mode` y el enum; se pierden los valores de modalidad existentes.

```powershell
npx prisma db execute --file prisma/migrations/20261102075333_takeout_payment_mode/down.sql
npx prisma db execute --file prisma/migrations/20261102075333_takeout_payment_mode/migration.sql
```

### Reversión de categorías y platillos por sucursal

La migración `20261104160000_categorias_platillos_sucursal` debe revertirse antes que las demás migraciones propias. Su `down.sql` rechaza la operación si hay categorías, porque unir las copias por sucursal en una categoría global perdería sus diferencias; hay que respaldar y retirar antes categorías y platillos. Restaura `categories_name_key`, `dishes_category_id_fkey` y NUMERIC(8,2) en el precio, y quita las columnas e índices agregados.

```powershell
npx prisma db execute --file prisma/migrations/20261104160000_categorias_platillos_sucursal/down.sql
npx prisma db execute --file prisma/migrations/20261104160000_categorias_platillos_sucursal/migration.sql
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

Los tests de integración insertan fixtures dentro de una transacción y hacen rollback por caso; comprueban código SQLSTATE y nombre de CHECK, UNIQUE o FK con `toMatchObject({ code, constraint })`. Incluyen rol inválido, correo duplicado y estado de platillo inválido. Los errores de enum (22P02), longitud (22001), precisión (22003) y NOT NULL (23502) no tienen nombre de constraint en PostgreSQL: se comprueba que sea undefined. La excepción es la repetibilidad del seed de `test/db-catalog-branch.e2e-spec.ts`: el seed confirma sus escrituras, así que deja cargados los datos base y de catálogo en la base de `DATABASE_URL`; los cambios de precio y estado que hace la prueba se restauran al terminar.

El verificador de migraciones necesita CREATEDB. Crea una base aleatoria, aplica las migraciones heredadas y prueba aplicar/revertir/reaplicar cada migración con down.sql. Compara tipos, columnas, defaults, índices, CHECK, FK y enums, y repite el ciclo conjunto. Comprueba el rechazo sin pérdida de datos de reversiones protegidas. Para DB-01 también siembra datos con el esquema anterior y verifica la copia de categorías, la reasignación de platillos, la conversión de `status` y el fallo sin cambios cuando no hay sucursales. Elimina solo su base temporal y no modifica la base de DATABASE_URL.
