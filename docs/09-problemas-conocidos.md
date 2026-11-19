# 9. Problemas conocidos y pendientes

Lista de lo que falla, quedó incompleto o no está confirmado desde el código o las fuentes del proyecto.

## 9.1 Estados y enums

- **Estados en inglés en la API.** Los pedidos devuelven `PENDING`, `IN_PREPARATION`, `READY` y `DELIVERED`. La historia de usuario usa PENDIENTE, EN_PREPARACION, LISTO y ENTREGADO. La interfaz traduce; los textos de error y la documentación de algunas respuestas mezclan ambos idiomas.
- **Pagos: mezcla de idiomas entre la base y la API.** La base guarda `PAID` y `REJECTED`, y la API del pago simulado responde APROBADO y RECHAZADO. Es una mezcla conocida, no un error de datos: la interfaz muestra el texto en español.
- **Valores heredados del enum**, sin uso en el MVP: `OrderStatus.PENDING_PAYMENT` y `CONFIRMED`; `OrderType.DELIVERY`; `CANCELED` en `AccountStatus` y `OrderItemStatus`; `TableStatus.RESERVED` y `OUT_OF_SERVICE`; `PaymentStatus.REFUNDED` (no hay devoluciones en el MVP). La decisión de eliminarlos quedó abierta en `docs/decisiones/modelo-datos.md`.
- **Siete roles en la base, cinco en la historia.** `CASHIER` (CAJERO) e `INVENTORY_MANAGER` (ENCARGADO_INVENTARIO) existen en el enum, pero no tienen flujo en las historias del alcance.

## 9.2 Pedidos

- **Pedidos sin número legible.** La columna `orders.order_number` existe, pero ningún flujo la asigna: queda en `null`. La cocina y "mis pedidos" muestran un pedido sin número visible.
- **Idempotencia: documentación desactualizada.** `docs/decisiones/modelo-datos.md` describe el encabezado `Idempotency-Key`. La decisión posterior (`docs/decisiones/pedido-llevar.md`) lo pasó a `operationKey` en el cuerpo, que es lo que implementa el código (`@IsUUID()` en el DTO). Hay que actualizar `modelo-datos.md`.
- **Precio histórico en el pedido.** Si un platillo cambia de precio después de confirmar, el pedido conserva el precio original; `expectedPrice` detecta el cambio con 409 solo si el cliente lo envía.

## 9.3 Rutas de la API

- **Rutas mezcladas en inglés y español.** Conviven `/orders`, `/dishes`, `/reviews`, `/branches`, `/loyalty`, `/kitchen/orders` con `/sucursales/:sucursalId/menu`. La convención del proyecto pide rutas en español cuando así lo define la historia de usuario. Cualquier cambio de ruta rompe al frontend y debe coordinarse con ese repositorio.
- **Cambios de nombre pendientes.** Renombrar rutas rompe al frontend; cualquier cambio debe coordinarse con el repositorio de frontend.

## 9.4 Autorización

- **Roles en los servicios, no en un guard.** No hay un `RolesGuard` con `@Roles`. Cada servicio comprueba su rol. Si se agrega una ruta nueva, un desarrollador puede olvidar la comprobación. Ver [02 · Arquitectura](02-arquitectura.md#25-decisiones-técnicas), decisión 9.
- **Acceso de gerente a la configuración.** `GET /branches/:id/config` es público y solo expone `isOpen`. Falta un GET protegido para que el gerente vea la última modificación y quién la hizo (HU-11).
- **Sin endpoint para deshabilitar platillos.** El gerente no puede deshabilitar un platillo desde la API. El estado `DISABLED` solo viene del seed o se cambia directamente en la base.
- **Sin flujo para cambiar el estado de una mesa.** `TableStatus` (LIBRE, OCUPADA, POR_LIMPIAR, etc.) no se modifica desde ningún endpoint.
- **Alcance del gerente general.** Según la sección 2.7 de la PDF, consulta el inventario de las sucursales autorizadas y las ventas de cualquier sucursal o de todas. El código aplica el mismo alcance al inventario (todas las sucursales activas) y a las ventas; en mesas y reservaciones también ve cualquier sucursal, aunque la sección 2.7 no las lista.

## 9.5 Base de datos

- **Zona horaria no uniforme.** Las convenciones piden `TIMESTAMPTZ` en todas las fechas. La migración inicial define `users` (`created_at`, `updated_at`) y `refresh_tokens` (`expires_at`, `revoked_at`, `created_at`) como `TIMESTAMP(3)`, sin zona horaria. Las tablas creadas después usan `TIMESTAMPTZ(6)`. Pendiente de corregir en una migración.
- **Dos campos de disponibilidad en platillos.** `dishes.status` y `dishes.is_available` existen a la vez durante la transición; el esquema marca `status` como valor heredado.
- **Documentos fiscales sin emisión.** La tabla `fiscal_documents` existe, pero el MVP solo genera comprobante simple (`simple_receipts`).
- **Restricciones que Prisma no declara.** Los CHECK y la restricción de solape de reservaciones se agregaron a mano en el SQL de la migración. Si se regenera una migración desde cero, deben conservarse.

## 9.6 Seguridad

- **Credenciales en Trello.** La descripción de la card de HU-05 incluye correos y contraseñas de cuentas de prueba. Hay que quitarlas de la card, cambiar esas contraseñas y entregar las cuentas solo por Moodle. No se copian en esta documentación.
- **Swagger activo fuera de producción por defecto.** Si `SWAGGER_ENABLED` no se define, Swagger está activo en desarrollo y en test, y desactivado en producción. `.env.example` y Compose lo fijan en `false`, así que en local hay que activarlo explícitamente.
- **Contraseñas de prueba en el seed.** El seed base exige `DEMO_SEED_PASSWORD` y se niega en producción. Los seeds de reseñas y de ventas no tienen esa comprobación y usan un correo fijo (`demo@example.com`); no deben ejecutarse contra producción.
- **Límites de tasa.** Los valores por defecto son para desarrollo. Antes de la entrega conviene revisarlos con el tráfico esperado.

## 9.7 Frontend

- **`API_URL` no coincide con el puerto de la API.** `.env.example` del frontend usa `http://localhost:8000`, pero la API escucha en el puerto 3000 por defecto. `API_URL` debe terminar en `/api/v1`, porque las rutas se construyen de forma relativa a esa base.
- **Pruebas sin script.** Las pruebas de `tests/` no tienen script en `package.json`. Se ejecutan con `node --experimental-strip-types tests/<archivo>.mjs`.
- **Documentación duplicada.** La carpeta `docs/` del frontend describe contratos que también aparecen en este repositorio. Hay que mantener una sola fuente.

## 9.8 Despliegue

- **Sin release publicado.** `main` solo tiene los merges del boilerplate y no tiene tags. Las URLs de Vercel, Render y Neon siguen en [pendiente].
- **Arranque en Render.** Antes de iniciar la API debe aplicarse `prisma migrate deploy`, igual que en Compose. Los valores de las variables de producción se completan después del despliegue; la lista de nombres está en [06 · Despliegue](06-despliegue.md).

## 9.9 Calidad y pendientes de QA

- **Historias en QA.** HU-04, HU-07 y HU-10 están en la columna QA, no en Hecho. HU-05 ya está en Hecho.
- **HU-07 sin evidencia.** Falta registrar la evidencia de QA-07 para los tres criterios sobre el ambiente desplegado.
- **PR sin enlazar en la card.** HU-04 y HU-10 dicen "pendiente: enlazar aquí" en la descripción de la card.
- **Pruebas que escriben en la base.** `test:e2e` incluye las suites `db-*`, y `test:db` y `test:security` usan la `DATABASE_URL` del `.env`. Las pruebas crean y borran sus filas por id; conviene una base de pruebas dedicada.

## 9.10 Documentación


## 9.11 Convenciones de nombres

- **Ramas.** Conviven `feat/BE-01-menu`, `feat/be-1.2.1-menu-publico`, `feature/FE-07-loyalty-points` y `fix/db-ajustes-primer-avance`. La convención recomendada está en [07 · Forma de trabajo](07-forma-de-trabajo.md#72-git-flow).
- **Commits.** Parte del historial de `develop` no usa `tipo(ámbito): descripción (ID)`, por ejemplo "Add env.example" o "security: harden HTTP access...". Los commits nuevos sí deben seguir la convención.
