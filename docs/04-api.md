# 4. API

- Prefijo global: `/api/v1`. Ejemplo: `POST /api/v1/auth/login`.
- Documentación interactiva (Swagger UI): [pendiente]/api/docs. Está activa solo si `SWAGGER_ENABLED=true`; en producción está desactivada por defecto.
- Formato: JSON. Los precios se devuelven como texto con dos decimales (`"8.50"`).
- Los campos de entrada que no estén en el DTO se rechazan con 400.

## 4.1 Autenticación

El login recibe `email` y `password`, y devuelve un access token y un refresh token.

```http
POST /api/v1/auth/login
Content-Type: application/json

{ "email": "<correo>", "password": "<contraseña>" }
```

Respuesta (200): `accessToken`, `refreshToken`, `expiresIn` (segundos) y `user`.

Para las rutas protegidas se envía el access token en el encabezado:

```http
Authorization: Bearer <accessToken>
```

| Token | Duración | Notas |
|---|---|---|
| Access token (JWT) | `JWT_EXPIRES_IN`, por defecto 15 minutos (entre 60 y 900 s) | Lleva `sub`, `email`, `role` y `branchId`. |
| Refresh token | `REFRESH_TOKEN_EXPIRES_IN_DAYS`, por defecto 7 días | Opaco. Cada uso lo rota: el anterior queda revocado. Se guarda como hash. |

- `POST /api/v1/auth/refresh` con `{ "refreshToken": "..." }` devuelve un par nuevo. Si se reutiliza un refresh token ya rotado, se revocan todas las sesiones del usuario.
- `POST /api/v1/auth/logout` con `{ "refreshToken": "..." }` revoca la sesión y responde 204.
- Sin token válido, la API responde 401. Con token válido pero sin permiso, responde 403.
- El login tiene límite de intentos por IP y por cuenta (`RATE_LIMIT_LOGIN_IP`, `RATE_LIMIT_LOGIN_ACCOUNT`).

## 4.2 Roles en la tabla

| Abreviatura | Rol en la API |
|---|---|
| Público | Sin sesión |
| Autenticado | Cualquier usuario con sesión válida |
| CLIENT | Cliente |
| WAITER | Mesero |
| COOK | Cocina |
| BRANCH_ADMIN | Gerente de sucursal (solo su sucursal) |
| GENERAL_MANAGER | Gerente general |
| Personal | WAITER, COOK, CASHIER, BRANCH_ADMIN o GENERAL_MANAGER de la sucursal |

Los roles se validan en los servicios. Ver [02 · Arquitectura](02-arquitectura.md#25-decisiones-técnicas), decisión 9.

## 4.3 Endpoints

### Autenticación y usuarios

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| POST | `/auth/login` | Inicia sesión con correo y contraseña. | Público |
| POST | `/auth/refresh` | Rota el refresh token y devuelve un par nuevo. | Público (token en el cuerpo) |
| POST | `/auth/logout` | Revoca el refresh token. Responde 204. | Público (token en el cuerpo) |
| GET | `/auth/me` | Devuelve el usuario autenticado. | Autenticado |
| POST | `/users` | Registra una cuenta nueva. Siempre crea CLIENTE; no acepta rol. | Público |
| GET | `/` (ruta `/api/v1`) | Health check. | Público |

### Sucursales y configuración

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| GET | `/branches` | Lista sucursales con datos básicos y estado. | Público |
| GET | `/branches/:id` | Datos básicos y estado de una sucursal. | Público |
| GET | `/branches/me/branch` | Sucursal asociada al usuario autenticado. | Autenticado |
| GET | `/branches/:id/config` | Indica si la sucursal está abierta (`isOpen`). Una sucursal cerrada sigue mostrando el menú. | Público |
| PATCH | `/branches/:id/config` | Marca la sucursal como ABIERTA (`isOpen: true`) o CERRADA (`isOpen: false`). Registra quién y cuándo. | BRANCH_ADMIN de esa sucursal |
| GET | `/branches/:branchId/rooms` | Lista salones y cantidad de mesas. | Personal de la sucursal o GENERAL_MANAGER |
| GET | `/branches/:branchId/tables` | Lista mesas de la sucursal. | Personal de la sucursal o GENERAL_MANAGER |
| GET | `/branches/:branchId/tables/:id` | Consulta una mesa y su salón. | Personal de la sucursal o GENERAL_MANAGER |
| GET | `/branches/:id/rating` | Promedio y cantidad de reseñas de la sucursal. | Público |

### Menú y platillos

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| GET | `/sucursales/:sucursalId/menu` | Menú vigente de la sucursal, sin depender de si está abierta. | Público |
| GET | `/dishes?branchId=<uuid>` | Platillos disponibles por sucursal, ordenados por categoría y nombre. Excluye eliminados, no disponibles y categorías inactivas. | Público |

### Pedidos

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| POST | `/orders` | Registra un pedido para llevar. Total calculado en el servidor. Usa `operationKey` para evitar duplicados en reintentos; `expectedPrice` opcional detecta cambios de precio con 409. Exige sucursal abierta. | CLIENT |
| POST | `/orders/salon` | Registra un pedido de salón para una mesa. | WAITER de la sucursal |
| GET | `/orders/me` | Lista los pedidos propios. | CLIENT |

### Cocina

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| GET | `/kitchen/orders` | Cola de la cocina: pedidos PENDING e IN_PREPARATION de la sucursal, por fecha de creación ascendente, con notas por línea. | COOK |
| PATCH | `/kitchen/orders/:id/status` | Avanza el pedido PENDING → IN_PREPARATION → READY. Saltar una etapa devuelve 409. READY genera el aviso para el cliente. | COOK |
| GET | `/kitchen/orders/ready` | Pedidos LISTO de la sucursal. | WAITER |
| PATCH | `/kitchen/orders/:id/deliver` | Confirma la entrega: LISTO → DELIVERED. | WAITER |

### Reservaciones

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| GET | `/reservations/availability` | Mesas disponibles para un intervalo de 90 minutos. | CLIENT |
| POST | `/reservations` | Reserva una mesa disponible. Si la mesa está ocupada en ese intervalo, responde 409. | CLIENT |
| GET | `/reservations/branches/:branchId/reservations` | Reservaciones de la sucursal. | Personal de la sucursal (GENERAL_MANAGER puede ver cualquiera) |

### Inventario y recetas

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| GET | `/inventory` | Existencias, mínimo y bandera `isLowStock` por insumo. | BRANCH_ADMIN de su sucursal o GENERAL_MANAGER |

### Pagos

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| POST | `/payments/simulate` | Simula el pago de un pedido propio en dos segundos. Tarjeta terminada en 4242 aprueba; 0002 rechaza. Un pedido ya pagado responde 409. | CLIENT (pedido propio) |

### Reseñas

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| POST | `/reviews` | Crea una reseña de 1 a 5 para un pedido entregado propio. Un pedido PENDING se rechaza; un pedido con reseña responde 409. | CLIENT |

### Lealtad

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| GET | `/loyalty/me` | Saldo de puntos. Responde `{ "points": n }`, con 0 si aún no hay cuenta. | CLIENT |
| GET | `/loyalty/rewards` | Recompensas activas, ordenadas por costo en puntos. | CLIENT |
| POST | `/loyalty/redemptions` | Canjea puntos y aplica una recompensa a un pedido propio. | CLIENT |
| GET | `/loyalty/redemptions/me` | Historial propio de canjes. | CLIENT |

### Notificaciones

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| GET | `/notifications/me` | Buzón propio. | CLIENT |
| PATCH | `/notifications/:id/read` | Marca un aviso propio como leído. Es idempotente. | CLIENT (dueño) |

### Reportes

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| GET | `/reports/sales?from=YYYY-MM-DD&to=YYYY-MM-DD` | Total de ventas aprobadas por sucursal y rango, con fechas inclusivas. | BRANCH_ADMIN (su sucursal) o GENERAL_MANAGER (todas) |
| GET | `/reports/top-dishes?from=YYYY-MM-DD&to=YYYY-MM-DD` | Platillos más vendidos por cantidad. | BRANCH_ADMIN (su sucursal) o GENERAL_MANAGER |

Las rutas de reportes usan los parámetros `from` y `to`. Si `from` es posterior a `to`, la API responde 400.
