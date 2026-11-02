# Modelo de datos: Anexo A

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

## Decisión del equipo: operation_id

Se conserva `operationId String @unique @default(uuid())`, obligatorio. El UUID por defecto lo genera el cliente Prisma, no PostgreSQL. Identifica también pedidos de sala sin clave externa. En BE-2.2.1 el servicio debe exigir Idempotency-Key, pasar explícitamente el mismo UUID a `operationId` y reutilizarlo en reintentos; generar otro UUID por solicitud no garantiza idempotencia. La restricción UNIQUE y la resolución transaccional de colisiones permiten devolver el pedido existente, también bajo concurrencia. Hacerlo nullable no mejora esa garantía.

## Preguntas abiertas

¿Se eliminan CONFIRMED de OrderStatus, DELIVERY de OrderType y CANCELED de AccountStatus y OrderItemStatus para limitar los conjuntos a DB-2.1.1? La decisión sigue abierta; se conservan esos valores. También queda por acordar el uso de RESERVED y OUT_OF_SERVICE en mesas. Esta rama no altera esos conjuntos ni define las reglas de otras épicas.

## Reversión

`down.sql` se genera con `prisma migrate diff --from-schema <posterior> --to-schema <anterior> --script` y se completa con los CHECK y protecciones de enums. Rechaza usuarios INVENTORY_MANAGER y mesas NEEDS_CLEANING todavía en uso. En una transacción retira los CHECK y UNIQUE propios, reconstruye los enums anteriores y restaura sus defaults. No convierte ni elimina filas.

Se revierte de la migración más reciente a la más antigua, solo sobre una base en la versión correspondiente:

```powershell
npx prisma db execute --file prisma/migrations/20261102023859_base_anexo_a/down.sql
npx prisma db execute --file prisma/migrations/20261102023859_base_anexo_a/migration.sql
```

`db execute` no actualiza `_prisma_migrations`: para completar el ciclo se reaplica el SQL explícito. `migrate deploy` no reaplica una migración ya registrada como exitosa. Hasta restaurarla existe drift; no se debe borrar historial ni resetear datos para ocultarlo.
