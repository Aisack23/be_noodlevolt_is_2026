# 5. Instalación local

## 5.1 Requisitos

| Herramienta | Versión | Para qué |
|---|---|---|
| Node.js | 24 (la imagen Docker usa `node:24-alpine`) | Ejecutar la API y las herramientas de npm |
| npm | El que incluye Node 24 | Instalar dependencias |
| Docker Desktop (o Docker Engine) con Compose v2 | Compose v2 | Levantar PostgreSQL 18 |
| PostgreSQL | 18 (imagen `postgres:18-alpine`) | Base de datos; se levanta con Docker |
| Git | Cualquier versión reciente | Clonar y trabajar con ramas |

No es necesario instalar PostgreSQL en el equipo: el `docker-compose.yml` lo levanta.

## 5.2 Pasos

```bash
# 1. Clonar y ubicarse en el repositorio
git clone https://github.com/Aisack23/be_noodlevolt_is_2026.git
cd be_noodlevolt_is_2026

# 2. Crear el archivo de variables y completarlo (ver tabla 5.3)
cp .env.example .env

# 3. Levantar PostgreSQL 18 con Docker y esperar a que esté healthy
docker compose up -d postgres
docker compose ps

# 4. Instalar dependencias (el postinstall genera el cliente de Prisma)
npm install

# 5. Aplicar las migraciones
npm run prisma:deploy

# 6. Cargar los datos de prueba (requiere DEMO_SEED_PASSWORD en .env)
npm run db:seed:base

# 7. Arrancar la API en modo watch
npm run start:dev
```

La API queda disponible en `http://localhost:3000/api/v1`. En desarrollo, Swagger está activo en `http://localhost:3000/api/docs`.

### Alternativa: todo en Docker

```bash
docker compose up --build
```

El servicio `api` aplica las migraciones pendientes con `prisma migrate deploy` y luego inicia `dist/main.js`. Esta opción no carga datos de prueba; para cargarlos, ejecutar `npm run db:seed:base` apuntando `DATABASE_URL` al contenedor.

### Datos de prueba adicionales

Ejecutar después de `db:seed:base`:

| Comando | Qué agrega |
|---|---|
| `npm run db:seed:catalog` | Categorías y platillos por sucursal, con precios por sucursal |
| `npm run db:seed:branch-config` | Estado ABIERTA/CERRADA de las sucursales |
| `npm run db:seed:inventory` | Insumos y existencias por sucursal |
| `npm run db:seed:review` | Pedidos y reseñas de ejemplo |
| `npm run db:seed:loyalty` | Cuentas de lealtad de ejemplo |
| `npm run db:seed:rewards` | Recompensas canjeables |
| `npm run db:seed:notifications` | Avisos internos de ejemplo |
| `npm run db:seed:sales-report` | Ventas aprobadas para probar reportes |

Los seeds son upserts y no sobrescriben cambios posteriores. El seed base se niega a correr si `NODE_ENV=production`. Las credenciales de las cuentas de prueba se entregan en Moodle; no se documentan en este repositorio.

## 5.3 Variables de entorno

Nombres tomados de `.env.example` y de `src/config/env.validation.ts`. No incluye valores.

| Variable | Obligatoria | Descripción |
|---|---|---|
| `NODE_ENV` | No | `development`, `test` o `production`. |
| `PORT` | No | Puerto de la API (1 a 65535). Por defecto 3000. |
| `POSTGRES_USER` | No | Usuario del contenedor de PostgreSQL. |
| `POSTGRES_PASSWORD` | Sí (Compose) | Contraseña del contenedor. Compose no arranca sin ella. |
| `POSTGRES_DB` | No | Nombre de la base de datos del contenedor. |
| `POSTGRES_PORT` | No | Puerto publicado en `127.0.0.1` del host. |
| `DATABASE_URL` | Sí | Cadena de conexión que usa la API y Prisma en el host. |
| `CONTAINER_DATABASE_URL` | No (Compose) | Cadena de conexión que usa el servicio `api` dentro de Compose. |
| `JWT_SECRET` | Sí | Secreto de firma de los JWT. Mínimo 32 bytes, aleatorio y sin valores de ejemplo. |
| `JWT_EXPIRES_IN` | No | Duración del access token, en `s` o `m`, entre 60 y 900 segundos. |
| `REFRESH_TOKEN_EXPIRES_IN_DAYS` | No | Días de vida del refresh token (1 a 30). |
| `BCRYPT_SALT_ROUNDS` | No | Costo de bcrypt (10 a 14). |
| `CORS_ORIGINS` | No | Orígenes permitidos separados por coma. En producción deben ser HTTPS. |
| `TRUSTED_PROXY_CIDRS` | No | Redes de proxies de confianza, para leer la IP real del cliente. |
| `IP_ALLOWLIST` | No | Redes autorizadas a acceder a la API, si se usa. |
| `SWAGGER_ENABLED` | No | `true` o `false`. Por defecto activo fuera de producción. |
| `RATE_LIMIT_GLOBAL` | No | Peticiones globales permitidas por ventana. |
| `RATE_LIMIT_LOGIN_IP` | No | Intentos de login por IP. |
| `RATE_LIMIT_LOGIN_ACCOUNT` | No | Intentos de login por cuenta. |
| `RATE_LIMIT_REGISTER` | No | Registros permitidos por ventana. |
| `RATE_LIMIT_REFRESH` | No | Renovaciones de token permitidas por ventana. |
| `RATE_LIMIT_WRITES` | No | Escrituras permitidas por ventana. |
| `DEMO_SEED_PASSWORD` | Solo para seeds | Contraseña de las cuentas demo: entre 12 caracteres y 72 bytes. Nunca en producción. |

Generar un `JWT_SECRET` con `openssl rand -base64 32`.

## 5.4 Pruebas y calidad

| Comando | Qué ejecuta | Requisito |
|---|---|---|
| `npm test` | Pruebas unitarias (`*.spec.ts`) con dobles del repositorio | Ninguno |
| `npm run test:db` | Pruebas contra la base de datos | PostgreSQL con la `DATABASE_URL` del `.env`. Las pruebas crean sus propias filas y las borran por id; conviene una base de pruebas dedicada |
| `npm run test:e2e` | Pruebas de endpoints con Supertest, incluidas las suites `db-*`, con autorización por rol y sucursal | PostgreSQL con la `DATABASE_URL` del `.env` |
| `npm run test:security` | Pruebas de la capa de seguridad contra la base | PostgreSQL de Docker |
| `npm run test:migrations` | Verifica que cada migración tenga su reversión | Ninguno |
| `npm run lint` | oxlint con reglas de tipos | Ninguno |
| `npm run build` | Compila a `dist/` y valida los imports en tiempo de ejecución | Ninguno |
| `npm run format` | Aplica Prettier a `src/` y `test/` | Ninguno |

Antes de cada commit deben pasar `npm run lint`, `npm run build` y `npm test`.

## 5.5 Problemas frecuentes

- **`Faltan variables de entorno obligatorias`**: falta `DATABASE_URL` o `JWT_SECRET` en `.env`.
- **`JWT_SECRET debe ser aleatorio`**: el valor es corto o es un valor de ejemplo. Generar uno nuevo.
- **Compose no arranca**: falta `POSTGRES_PASSWORD` o `JWT_SECRET` en `.env`.
- **El seed base falla**: `DEMO_SEED_PASSWORD` no está definida o no cumple la longitud.
- **Puerto 5432 ocupado**: cambiar `POSTGRES_PORT` y la parte del puerto en `DATABASE_URL`.
