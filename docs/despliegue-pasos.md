# Despliegue (entrega final)

Arquitectura de producción:

| Pieza | Servicio | Repo / origen |
| --- | --- | --- |
| Base de datos | Neon (PostgreSQL 18) | — |
| API (NestJS) | Render, plan gratuito, runtime Docker | este repo, rama `main` |
| Frontend (Next.js) | Vercel | `fe_noodlevolt_is_2026`, rama `main` |

Principio: **ningún secreto entra al repo**. Cada valor sensible se escribe a mano en el panel de cada servicio. Este documento solo dice el nombre de cada variable y de dónde sale.

Antes de empezar: el despliegue sale de `main`. La PR de esta guía (y las de `chore/despliegue`) deben estar aprobadas y fusionadas en `develop` y luego en `main`.

---

## 1. Base de datos en Neon

1. Crea un proyecto en Neon con PostgreSQL 18.
2. Abre **Connection details** y elige la conexión **directa**, no la **pooled** (el host no debe llevar `-pooler`). Las migraciones y el seed deben usar la directa.
3. Copia la cadena. Viene con `sslmode=require`; cámbiala a `sslmode=verify-full`:

   ```
   postgresql://<usuario>:<contraseña>@<host>.neon.tech/<base>?sslmode=verify-full
   ```

   La validación de arranque (`src/config/env.validation.ts`) rechaza producción si falta `verify-full`, si la contraseña es de ejemplo o si la URL trae parámetros `ssl`, `host`, `port`, `user` o `password`. Neon no los necesita.

**Variable que sale de aquí:** `DATABASE_URL` (la cadena anterior).

---

## 2. API en Render

### 2.1 Crear el servicio

1. En Render: **New → Blueprint**, conecta el repo del backend y elige la rama **`main`**. Render lee `render.yaml`.
2. Render pedirá los valores de las variables marcadas como `sync: false`. Llénalas con la tabla de la sección 2.2.
3. Crea el servicio. El arranque ejecuta `npm run prisma:deploy` y luego `node dist/main.js`. En los logs debe aparecer `All migrations have been successfully applied` y `Conectado a PostgreSQL`.

### 2.2 Variables de Render

| Variable | Valor | De dónde sale |
| --- | --- | --- |
| `NODE_ENV` | `production` | Ya viene en `render.yaml` |
| `DATABASE_URL` | cadena `verify-full` | Sección 1 (Neon) |
| `JWT_SECRET` | aleatorio, ≥ 32 bytes | Lo genera Render (`generateValue: true`) |
| `CORS_ORIGINS` | `https://<proyecto>.vercel.app` | URL de producción del frontend en Vercel, sin barra final |
| `TRUSTED_PROXY_HOPS` | `1` | Ya viene en `render.yaml`; ver la nota de abajo |
| `SWAGGER_ENABLED` | `true` | Ya viene en `render.yaml` |
| `JWT_EXPIRES_IN`, `REFRESH_TOKEN_EXPIRES_IN_DAYS`, `BCRYPT_SALT_ROUNDS`, `RATE_LIMIT_*` | valores por defecto | Ya vienen en `render.yaml` |

No pongas `ALLOW_DEMO_SEED` ni `DEMO_SEED_PASSWORD` en Render: solo se usan en la máquina de quien corre el seed (sección 4).

**Nota sobre `TRUSTED_PROXY_HOPS=1`.** Render se pone delante de la API y agrega la IP real del cliente al final de `X-Forwarded-For`. Con `1` la API confía en ese único proxy: `req.secure` queda en verdadero (sin esto, cada petición recibe 426) y los límites por IP usan la IP del cliente. No uses `TRUSTED_PROXY_CIDRS` a la vez; las dos variables son excluyentes y el arranque lo rechaza.

**Swagger.** Con `SWAGGER_ENABLED=true` la documentación queda en `https://<api>.onrender.com/api/docs`. El valor por defecto en producción es `false`.

### 2.3 Plan gratuito

El servicio se duerme tras unos 15 minutos sin tráfico. La primera petición después tarda varios segundos. Si la demo lo necesita despierto, abre `/api/v1` unos minutos antes.

---

## 3. Frontend en Vercel

1. En Vercel: **Add New → Project**, importa `fe_noodlevolt_is_2026` y elige la rama **`main`**.
2. **Node.js Version:** `22.x` o `24.x` (Next 16 requiere Node 20.9 o superior).
3. Variables de entorno (ámbito **Production**):

   | Variable | Valor | De dónde sale |
   | --- | --- | --- |
   | `API_URL` | `https://<servicio>.onrender.com/api/v1` | URL pública de Render + `/api/v1` |

   `API_URL` debe terminar en `/api/v1`: el login construye `auth/login` relativo a esa base.
4. Despliega. Anota la URL de producción de Vercel (`https://<proyecto>.vercel.app`).
5. Vuelve a Render y pon esa URL en `CORS_ORIGINS` (sección 2.2). Render redespliega solo.

El login del frontend se hace desde el servidor de Next (server action), así que CORS no interviene en el login. CORS aplica a cualquier llamada que el navegador haga directo a la API.

---

## 4. Seed de datos demo (una sola vez)

El seed crea las cuentas de prueba y los datos de cada módulo. Se corre **desde tu máquina**, apuntando a la base de Neon con la conexión **directa**. No se corre dentro de Render porque el seed usa `tsx`, que la imagen de producción no incluye.

Requisitos: el repo del backend en `main`, `npm ci` ejecutado y la base ya migrada (paso 2.1).

Abre PowerShell en la carpeta del backend y ejecuta, reemplazando los marcadores:

```powershell
$env:DATABASE_URL = 'postgresql://<usuario>:<contraseña>@<host>.neon.tech/<base>?sslmode=verify-full'
$env:NODE_ENV = 'production'
$env:ALLOW_DEMO_SEED = 'true'
$env:DEMO_SEED_PASSWORD = '<contraseña-demo-de-12-a-72-bytes>'

npm run db:seed:base
npm run db:seed:catalog
npm run db:seed:rewards
npm run db:seed:branch-config
npm run db:seed:inventory
npm run db:seed:review
npm run db:seed:loyalty
npm run db:seed:notifications
npm run db:seed:sales-report

Remove-Item Env:DATABASE_URL, Env:NODE_ENV, Env:ALLOW_DEMO_SEED, Env:DEMO_SEED_PASSWORD
```

Reglas:

- Corre la secuencia **una sola vez**. La secuencia se ensayó sobre una base vacía con todos los comandos en salida 0; no se probó una segunda corrida sobre datos existentes.
- Sin `ALLOW_DEMO_SEED=true` el seed se niega en producción con el mensaje `…sin ALLOW_DEMO_SEED=true`. Es el comportamiento esperado.
- `DEMO_SEED_PASSWORD` es obligatoria. Las cuentas demo quedan con esa contraseña. Usa una distinta a la de tu cuenta personal.
- El último comando borra las variables de la sesión. No escribas estos valores en ningún archivo.

Cuentas creadas (todas con la contraseña `DEMO_SEED_PASSWORD`):

| Correo | Rol | Sucursal |
| --- | --- | --- |
| `demo@example.com` | CLIENT | Sin sucursal |
| `waiter@example.com` | WAITER | Centro |
| `cook@example.com` | COOK | Centro |
| `cashier@example.com` | CASHIER | Santa Tecla |
| `inventory_manager@example.com` | INVENTORY_MANAGER | Santa Tecla |
| `branch_admin@example.com` | BRANCH_ADMIN | Santa Tecla |
| `branch_admin_centro@example.com` | BRANCH_ADMIN | Centro |
| `general_manager@example.com` | GENERAL_MANAGER | Sin sucursal |

---

## 5. Desactivar las cuentas demo

**No antes del martes 24 de noviembre de 2026.** Hasta esa fecha las cuentas deben funcionar para la revisión. Después, desactívalas con el SQL de Neon (SQL Editor):

```sql
UPDATE users SET is_active = false WHERE email LIKE '%@example.com';
```

Login y guard JWT rechazan usuarios inactivos, así que el acceso se corta sin borrar datos ni romper llaves foráneas. Verificado contra una base local con el seed.

---

## 6. Lista de verificación final

Marca cada punto en el ambiente desplegado.

- [ ] **HTTPS:** `http://<api>.onrender.com/api/v1` redirige o responde 426; `https://<api>.onrender.com/api/v1` responde 200.
- [ ] **Base:** los logs de Render muestran `Conectado a PostgreSQL` y `All migrations have been successfully applied`.
- [ ] **Swagger:** `https://<api>.onrender.com/api/docs` carga y muestra los endpoints.
- [ ] **CORS:** en las herramientas del navegador, una petición desde `https://<proyecto>.vercel.app` no da error de CORS. Desde un origen no permitido, la respuesta no trae `Access-Control-Allow-Origin`.
- [ ] **Login por rol:** entra desde el frontend en Vercel con cada cuenta y comprueba que ve su pantalla:
  - [ ] CLIENTE (`demo@example.com`)
  - [ ] MESERO (`waiter@example.com`)
  - [ ] COCINA (`cook@example.com`)
  - [ ] GERENTE (`branch_admin@example.com`)
  - [ ] GERENTE_GENERAL (`general_manager@example.com`)
- [ ] **Aislamiento por sucursal:** `branch_admin@example.com` recibe 403 al operar sobre Centro.
- [ ] **Límites por IP:** tras varios intentos fallidos de login, la API responde 429 (confirma que `TRUSTED_PROXY_HOPS` funciona y no cuenta todo el tráfico como una sola IP).
- [ ] **Datos semilla:** el menú, las sucursales y las recompensas tienen contenido.
- [ ] **Desactivación:** después del martes 24 de noviembre de 2026, las cuentas demo ya no inician sesión.

---

## Referencia de variables

Backend (Render):

| Variable | Obligatoria | Origen |
| --- | --- | --- |
| `NODE_ENV` | sí | `render.yaml` (`production`) |
| `DATABASE_URL` | sí | Neon, cadena directa con `sslmode=verify-full` |
| `JWT_SECRET` | sí | Render (generada) |
| `CORS_ORIGINS` | sí | URL de Vercel, sin barra final |
| `TRUSTED_PROXY_HOPS` | sí | `render.yaml` (`1`) |
| `SWAGGER_ENABLED` | no | `render.yaml` (`true`) |
| `JWT_EXPIRES_IN`, `REFRESH_TOKEN_EXPIRES_IN_DAYS`, `BCRYPT_SALT_ROUNDS`, `RATE_LIMIT_*` | no | `render.yaml` (valores por defecto) |
| `TRUSTED_PROXY_CIDRS` | no | No usar en Render; es excluyente con `TRUSTED_PROXY_HOPS` |

Solo en la máquina que corre el seed:

| Variable | Origen |
| --- | --- |
| `DATABASE_URL` | Neon, conexión directa |
| `NODE_ENV` | `production` |
| `ALLOW_DEMO_SEED` | `true` (solo en esa sesión) |
| `DEMO_SEED_PASSWORD` | La eliges tú (12 a 72 bytes) |

Frontend (Vercel):

| Variable | Origen |
| --- | --- |
| `API_URL` | URL de Render + `/api/v1` |
