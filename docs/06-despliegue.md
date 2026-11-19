# 6. Despliegue

## 6.1 Componentes

| Componente | Plataforma | URL | Rama de despliegue |
|---|---|---|---|
| Frontend (Next.js 16) | Vercel | [pendiente] | `main` |
| Backend (NestJS, imagen Docker) | Render | [pendiente] | `main` |
| Base de datos (PostgreSQL 18) | Neon | [pendiente] (no se publica) | — |
| Swagger | Render | [pendiente]/api/docs (solo con `SWAGGER_ENABLED=true`) | `main` |

Al 18 de noviembre de 2026, `main` solo contiene los merges iniciales del boilerplate y no tiene tags de versión [verificar antes de la entrega]. El despliegue en producción debe hacerse desde un release, no desde una rama de funcionalidad.

## 6.2 Cómo se publica una versión

El flujo sigue Git Flow. `develop` es la rama de integración y `main` es la rama de producción.

### Release

1. Crear `release/x.y.z` desde `develop`, donde `x.y.z` es la versión (por ejemplo, `release/1.0.0`).
2. Hacer en esa rama solo ajustes de publicación: versión, documentación y correcciones menores. No agregar funcionalidades.
3. Abrir un PR de `release/x.y.z` hacia `main`. Debe tener la aprobación de otro integrante.
4. Al hacer merge a `main`, crear el tag `vX.Y.Z` (por ejemplo, `v1.0.0`) sobre el commit de `main`.
5. Hacer merge de `main` de regreso a `develop`, para que los ajustes de la release no se pierdan.
6. Render despliega desde `main`. Verificar la URL pública antes de dar la entrega por terminada.

### Hotfix

1. Crear `hotfix/<descripcion>` desde `main`.
2. Corregir el problema y abrir un PR hacia `main`, con aprobación de otro integrante.
3. Crear el tag de parche (`vX.Y.Z+1`) después del merge.
4. Hacer merge de `main` a `develop`.

Las ramas de funcionalidad (`feat/...`, `fix/...`) se crean desde `develop` y se integran a `develop`; ver [07 · Forma de trabajo](07-forma-de-trabajo.md).

## 6.3 Variables de producción

Solo se listan los nombres. Los valores se configuran en el panel de cada plataforma y nunca se guardan en el repositorio.

### Backend (Render)

| Variable | Valor esperado en producción |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | Asignado por Render |
| `DATABASE_URL` | Cadena de Neon con contraseña propia y `sslmode=verify-full` |
| `JWT_SECRET` | Secreto aleatorio de al menos 32 bytes, distinto al de desarrollo |
| `JWT_EXPIRES_IN` | Entre `60s` y `900s` (por defecto `15m`) |
| `REFRESH_TOKEN_EXPIRES_IN_DAYS` | Entre 1 y 30 (por defecto 7) |
| `BCRYPT_SALT_ROUNDS` | Entre 10 y 14 (por defecto 12) |
| `CORS_ORIGINS` | Dominio HTTPS del frontend en Vercel |
| `TRUSTED_PROXY_CIDRS` | Redes del proxy de Render, para leer la IP real del cliente |
| `IP_ALLOWLIST` | Solo si se usa; vacía por defecto |
| `SWAGGER_ENABLED` | `false`, salvo que se necesite documentación pública |
| `RATE_LIMIT_GLOBAL` | Valor por defecto o ajustado tras pruebas de carga |
| `RATE_LIMIT_LOGIN_IP` | Valor por defecto o ajustado |
| `RATE_LIMIT_LOGIN_ACCOUNT` | Valor por defecto o ajustado |
| `RATE_LIMIT_REGISTER` | Valor por defecto o ajustado |
| `RATE_LIMIT_REFRESH` | Valor por defecto o ajustado |
| `RATE_LIMIT_WRITES` | Valor por defecto o ajustado |

`DEMO_SEED_PASSWORD` no se configura en producción. El seed base se niega a ejecutarse con `NODE_ENV=production`.

### Frontend (Vercel)

| Variable | Descripción |
|---|---|
| `API_URL` | URL base de la API de producción, con el prefijo `/api/v1` [verificar el formato que espera el frontend] |

## 6.4 Reglas de arranque en producción

Al iniciar, la API valida su configuración y se detiene con un mensaje claro si algo no cumple:

- `DATABASE_URL` debe usar una contraseña propia (no `postgres`, `password`, `changeme` ni `placeholder`), `sslmode=verify-full` y no puede tener parámetros SSL sobrescritos.
- `NODE_TLS_REJECT_UNAUTHORIZED` no puede ser `0`.
- Todos los orígenes de `CORS_ORIGINS` deben ser HTTPS.
- `JWT_SECRET` no puede ser un valor de ejemplo.

## 6.5 Migraciones

Antes de iniciar la API se aplican las migraciones pendientes con `npm run prisma:deploy` (`prisma migrate deploy`). La imagen de `docker-compose.yml` lo hace con `npx prisma migrate deploy && node dist/main.js`. Las migraciones nunca se ejecutan con `prisma migrate dev` en producción [verificar el comando de inicio configurado en Render].

Cada migración tiene su archivo `down.sql`, y `npm run test:migrations` verifica que existan.

## 6.6 Verificación después de desplegar

1. `GET /api/v1` responde 200 (health check).
2. `GET /api/v1/dishes?branchId=<id>` responde con el menú de una sucursal.
3. Iniciar sesión desde el frontend desplegado y comprobar que la cookie se guarda como `httpOnly`.
4. Confirmar que Swagger no está disponible si `SWAGGER_ENABLED=false` [verificar el código de respuesta en el despliegue].
