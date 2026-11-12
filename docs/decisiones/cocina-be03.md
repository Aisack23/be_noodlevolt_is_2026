# Cocina y entrega (BE-03 / DB-03)

Completa la base integrada en la PR #33 y la persistencia faltante de DB-03. Integra la PR #35 de BE-09, fusionada en develop mediante 0430c24. Fuente funcional: PDF V_FINAL, HU-03, DB-03, BE-03, FE-03 y secciones 2.7–2.9. Se reutilizan Order y OrderItem, sin una tabla paralela de comandas. La API conserva las rutas y claves de la base #33; los estados y roles del enum están en inglés.

| Método y ruta bajo /api/v1 | Rol | Contrato |
| --- | --- | --- |
| GET /kitchen/orders | COOK | PENDING e IN_PREPARATION, de su sucursal; createdAt ascendente |
| PATCH /kitchen/orders/:id/status | COOK | Body { "status": "IN_PREPARATION" } o { "status": "READY" }; secuencia PENDING → IN_PREPARATION → READY |
| GET /kitchen/orders/ready | WAITER | Solo READY propios de su sucursal; última fecha de llegada a READY ascendente, o createdAt si falta historial; desempate por id |
| PATCH /kitchen/orders/:id/deliver | WAITER | Sin body; READY → DELIVERED |

Ambos listados devuelven número, platillos, cantidades y nota por línea. Al entregar, el pedido deja de aparecer en el listado de listos. Los roles generales y administrativos no heredan acceso: solo COOK prepara y solo WAITER entrega.

Respuestas: 200 en éxito; 401 sin sesión válida; 403 sin el rol o sucursal requeridos; 400 por UUID o DTO inválido; 404 cuando el pedido no existe o pertenece a otra sucursal; 409 por salto o retroceso de etapa. Los listados vacíos responden 200 con []. Swagger describe las respuestas aplicables a cada endpoint.

Repetir el estado actual permitido para el rol devuelve 200 y la misma representación. No cambia updatedBy, updatedAt, líneas ni historial y no vuelve a emitir el aviso. Esto también aplica a una entrega repetida por otro mesero autorizado de la misma sucursal. Intentar preparar un pedido ya entregado devuelve 409.

## Persistencia e integración

La transacción bloquea el pedido de la sucursal con SELECT ... FOR UPDATE antes de validar. Cada avance real actualiza Order.status, Order.updatedBy con el actor de CurrentUser, Order.updatedAt y las líneas en PENDING o IN_PREPARATION (también READY al entregar); agrega OrderStatusHistory con estado anterior, siguiente, autor y changedAt. Las líneas canceladas se conservan.

La migración 20261109120000_order_updated_by agrega una FK nullable a users con ON DELETE SET NULL. Su down.sql rechaza con RAISE EXCEPTION cualquier reversión con updated_by no nulo. El verificador de migraciones comprueba el rechazo sin pérdida del dato ni del esquema, además del ciclo aplicar/revertir/reaplicar. El índice (branchId, status, createdAt), notas y timestamps existentes se reutilizan.

Al pasar a READY, la misma transacción llama a NotificationsService.notifyOrderReady(orderId, tx), de Isaac (PR #35). Su implementación obtiene orders.customer_id y registra PEDIDO_LISTO:<orderId>:<userId> mediante createMany({ skipDuplicates: true }), que genera INSERT ... ON CONFLICT DO NOTHING. Si no hay cliente, no se crea aviso. Se respetan UNIQUE y CHECK de DB-09. Se eliminó la inserción SQL propia de BE-03; no se duplica la lógica ni se cambia permanentemente el código de BE-09. Cualquier fallo del aviso revierte también pedido, líneas y auditoría.

El repositorio compartido de accounts-orders contiene la operación transaccional y traduce P2002/P2003/P2025 a errores de dominio en errors/. Depende del puerto OrderReadyNotifier, sin importar ni inyectar NotificationsService. AccountsOrdersModule enlaza el puerto con el servicio existente mediante useExisting. El puerto comparte el cliente transaccional del repositorio; la prueba unitaria comprueba su identidad y que no se invoque en reintentos. KitchenService valida el permiso con UserRole y traduce esos errores a HTTP; no utiliza el cliente ni las transacciones de Prisma. Los estados de KitchenOrderTransitionError se tipan con OrderStatus y sus consumidores importan desde errors/. La integración usa @Kitchen y sus barrels.

## Verificación reproducible

Se utilizó el worktree F:/be03 con .env propio y la base si_be_boilerplate_test_be03 en si_be_postgres. npm ci funcionó sin cambiar package-lock.json; Prisma se generó y las migraciones se aplicaron en esa base. El verificador de migraciones crea y elimina su propia base aleatoria hu_reversal_*; no elimina DATABASE_URL ni bases ajenas.

La suite test/db-kitchen.e2e-spec.ts usa autenticación real y PostgreSQL: matriz completa de roles, sucursal, orden y notas, transiciones válidas e inválidas, updatedBy y timestamps, historial, destinatario del aviso, ausencia de cliente, evento preexistente, reintentos, entrega y FK con ON DELETE SET NULL. Una prueba fuerza un fallo de inserción del aviso para verificar rollback completo.

Para la concurrencia, una conexión independiente abre BEGIN y bloquea el pedido. Se envían dos PATCH y se espera hasta observar ambas conexiones bloqueadas en pg_stat_activity; solo entonces se libera el bloqueo. Se comprueba un único avance y un único historial.

Se aplicaron individualmente estas mutaciones temporales; cada prueba falló por su aserción y el código original se restauró en finally:

| Mutación | Evidencia del fallo |
| --- | --- |
| Permitir saltos de etapa | PENDING → READY devolvió 200 en vez de 409 |
| Quitar filtro de sucursal del bloqueo | Pedido ajeno devolvió 200 en vez de 404 |
| Quitar FOR UPDATE | Dos entradas de historial en vez de una |
| Quitar ON CONFLICT (skipDuplicates: false en la implementación de Isaac) | El aviso preexistente produjo 409 en vez de 200 |

Los logs completos de mutaciones se conservan localmente en .tmp/be03-validation/ y no se versionan. Los fallos heredados de develop se reportan en la PR, sin corregir pickupAt ni la modalidad AT_COUNTER de pedidos.

## Resultado de la ejecución completa tras integrar PR #35

| Comando | Resultado |
| --- | --- |
| npm run lint | Correcto; advertencias heredadas fuera de BE-03 |
| npm run build | Correcto |
| npm test | 223 correctos |
| npm run test:db | 319 correctos, dos fallos conocidos de pedidos |
| npm run test:migrations | Correcto, incluido DB-03 y su down protegido |
| npm run test:e2e | 320 correctos, los mismos dos fallos conocidos |

Los 30 e2e de BE-03 y los 8 e2e de BE-09 pasan contra la implementación de Isaac. Los dos fallos heredados corresponden a pickupAt inválido/ausente y AT_COUNTER devuelto como ONLINE en test/db-orders.e2e-spec.ts; se conservaron como se solicitó. El cierre faltante de reservaciones fue corregido por PR #35, por lo que ya no bloquea las verificaciones ni requiere un cambio de BE-03 en HU-04.

La revisión incluye una regresión con un pedido IN_PREPARATION cuya línea sigue PENDING. La prueba falla con el filtro por estado actual y pasa al sincronizar las líneas pendientes/en preparación, conservando la nota y verificando su entrega posterior.
