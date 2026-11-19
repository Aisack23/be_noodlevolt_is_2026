# 9. Problemas conocidos y pendientes

Lista de lo que falla, quedó incompleto o no está confirmado. Lo marcado con **[verificar]** no se pudo confirmar desde el código o desde las fuentes del proyecto.

## 9.1 Estados y enums

- **Estados en inglés en la API.** Los pedidos devuelven `PENDING`, `IN_PREPARATION`, `READY` y `DELIVERED`. La historia de usuario usa PENDIENTE, EN_PREPARACION, LISTO y ENTREGADO. La interfaz traduce; los textos de error y la documentación de algunas respuestas mezclan ambos idiomas.
- **Pagos: mezcla de idiomas entre la base y la API.** La base guarda `PAID` y `REJECTED`, y la API del pago simulado responde APROBADO y RECHAZADO. Es una mezcla conocida, no un error de datos: la interfaz muestra el texto en español.
- **Valores heredados del enum**, sin uso en el MVP: `OrderStatus.PENDING_PAYMENT` y `CONFIRMED`; `OrderType.DELIVERY`; `CANCELED` en `AccountStatus` y `OrderItemStatus`; `TableStatus.RESERVED` y `OUT_OF_SERVICE`; `PaymentStatus.REFUNDED` (no hay devoluciones en el MVP). La decisión de eliminarlos quedó abierta en `docs/decisiones/modelo-datos.md`.
- **Siete roles en la base, cinco en la historia.** `CASHIER` (CAJERO) e `INVENTORY_MANAGER` (ENCARGADO_INVENTARIO) existen en el enum, pero no tienen flujo en las historias del alcance.

## 9.2 Pedidos

- **Pedidos sin número legible.** La columna `orders.order_number` existe, pero ningún flujo la asigna: queda en `null`. La cocina y "mis pedidos" muestran un pedido sin número visible.
- **Idempotencia: documentación y código no coinciden** [verificar]. `docs/decisiones/pedidos-be02.md` describe una clave de operación, pero el código la recibe como campo `operationKey` en el cuerpo, no como encabezado `Idempotency-Key`. Hay que alinear la documentación con el código.
- **Precio histórico en el pedido.** Si un platillo cambia de precio después de confirmar, el pedido conserva el precio original; `expectedPrice` detecta el cambio con 409 solo si el cliente lo envía.

## 9.3 Rutas de la API

- **Rutas mezcladas en inglés y español.** Conviven `/orders`, `/dishes`, `/reviews`, `/branches`, `/loyalty`, `/kitchen/orders` con `/sucursales/:sucursalId/menu`. La convención del proyecto pide rutas en español cuando así lo define la historia [verificar cuál se mantiene antes de la entrega].
- **Cambios de nombre pendientes.** Renombrar rutas rompe al frontend; cualquier cambio debe coordinarse con el repositorio de frontend.

## 9.4 Autorización

- **Roles en los servicios, no en un guard.** No hay un `RolesGuard` con `@Roles`. Cada servicio comprueba su rol. Si se agrega una ruta nueva, un desarrollador puede olvidar la comprobación. Ver [02 · Arquitectura](02-arquitectura.md#25-decisiones-técnicas), decisión 9.
- **Acceso de gerente a la configuración.** `GET /branches/:id/config` es público y solo expone `isOpen`. Falta un GET protegido para que el gerente vea la última modificación y quién la hizo (HU-11).
- **Sin endpoint para deshabilitar platillos.** El gerente no puede deshabilitar un platillo desde la API. El estado `DISABLED` solo viene del seed o se cambia directamente en la base.
- **Sin flujo para cambiar el estado de una mesa.** `TableStatus` (LIBRE, OCUPADA, POR_LIMPIAR, etc.) no se modifica desde ningún endpoint.
- **Acceso de gerente general a la sucursal.** Algunos endpoints del personal permiten al gerente general ver cualquier sucursal, y otros solo la suya [verificar que coincida con la sección 2.7 de la PDF en cada ruta].

## 9.5 Base de datos

- **Zona horaria no uniforme.** Las convenciones piden `TIMESTAMPTZ` para todas las fechas. `users.created_at`/`updated_at` y `refresh_tokens` se definen sin el tipo `timestamptz` [verificar en la migración vigente].
- **Dos campos de disponibilidad en platillos.** `dishes.status` y `dishes.is_available` existen a la vez durante la transición; el esquema marca `status` como valor heredado.
- **Documentos fiscales sin emisión.** La tabla `fiscal_documents` existe, pero el MVP solo genera comprobante simple (`simple_receipts`).
- **Restricciones que Prisma no declara.** Los CHECK y la restricción de solape de reservaciones se agregaron a mano en el SQL de la migración. Si se regenera una migración desde cero, deben conservarse.

## 9.6 Seguridad

- **Credenciales en Trello.** La descripción de la card de HU-05 incluye correos y contraseñas de cuentas de prueba. Hay que quitarlas de la card, cambiar esas contraseñas y entregar las cuentas solo por Moodle. No se copian en esta documentación.
- **Swagger activo fuera de producción.** Si `SWAGGER_ENABLED` no se define, Swagger queda activo en desarrollo y test y desactivado en producción. `.env.example` y Compose lo fijan en `false`, así que en local hay que activarlo a propósito [verificar].
- **Contraseñas de prueba en el seed.** El seed base exige `DEMO_SEED_PASSWORD` y se niega en producción. Los seeds de reseñas y de ventas usan un correo fijo (`demo@example.com`) y no tienen una comprobación equivalente [verificar que no se ejecuten contra producción].
- **Límites de tasa.** Los valores por defecto son para desarrollo. Antes de la entrega conviene revisarlos con el tráfico esperado.

## 9.7 Frontend

- **`API_URL` no coincide.** `.env.example` del frontend usa `http://localhost:8000`, pero la API escucha en el puerto 3000 por defecto. El README del frontend pide la base `/api/v1`, y el ejemplo no la incluye [verificar].
- **Pruebas sin script.** Las pruebas de la carpeta `tests/` se ejecutan con el runner de Node 24 (`node --test`), pero `package.json` no tiene un script `test` [verificar].
- **Documentación duplicada.** La carpeta `docs/` del frontend describe contratos que también aparecen en este repositorio. Hay que mantener una sola fuente.

## 9.8 Despliegue

- **Sin release publicado.** `main` solo tiene los merges del boilerplate y no tiene tags. Las URLs de Vercel, Render y Neon siguen en [pendiente].
- **Comando de inicio en Render** [verificar]. Debe aplicar `prisma migrate deploy` antes de iniciar la API, igual que Compose.
- **Variables de producción** [verificar]. Los nombres están en [06 · Despliegue](06-despliegue.md); falta confirmar que todas estén configuradas en Render y en Vercel.

## 9.9 Calidad y pendientes de QA

- **Historias en QA.** HU-04, HU-07 y HU-10 están en la columna QA, no en Hecho. HU-05 ya está en Hecho.
- **HU-07 sin evidencia.** Falta registrar la evidencia de QA-07 para los tres criterios sobre el ambiente desplegado.
- **PR sin enlazar en la card.** HU-04 y HU-10 dicen "pendiente: enlazar aquí" en la descripción de la card.
- **Pruebas e2e dependen de Docker.** `test:e2e`, `test:db` y `test:security` necesitan PostgreSQL levantado [verificar que las pruebas no borren datos de la base de desarrollo].

## 9.10 Documentación

- **Responsables distintos según la fuente.** Otra lista interna del equipo asigna algunas épicas de forma distinta a la PDF y a Trello. Ver [08 · Historias](08-historias.md).

## 9.11 Convenciones de nombres

- **Ramas.** Conviven `feat/BE-01-menu`, `feat/be-1.2.1-menu-publico`, `feature/FE-07-loyalty-points` y `fix/db-ajustes-primer-avance`. La convención recomendada está en [07 · Forma de trabajo](07-forma-de-trabajo.md#72-git-flow).
- **Commits.** Parte del historial de `develop` no usa `tipo(ámbito): descripción (ID)`, por ejemplo "Add env.example" o "security: harden HTTP access...". Los commits nuevos sí deben seguir la convención.
