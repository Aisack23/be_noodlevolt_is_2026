# Operación del backend endurecido

## Configuración de producción

`NODE_ENV=production` exige secretos inyectados por el servidor o su gestor de
secretos. Nest ignora `.env` en ese modo. La imagen excluye archivos `.env` del
contexto de Docker; la plantilla solo enumera variables y no contiene claves.
`npm run start:prod` fija ese modo antes de importar la aplicación; la imagen
de runtime también declara `NODE_ENV=production`.
El JWT de prueba del workflow se genera por job y se enmascara en sus logs.

| Variable                        | Regla                                                                                                                                                                   |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `JWT_SECRET`                    | Generado aleatoriamente, al menos 32 bytes; se rechazan valores de ejemplo y repeticiones triviales.                                                                    |
| `DATABASE_URL`                  | PostgreSQL, contraseña propia, exactamente un `sslmode=verify-full`; sin parámetros alternativos de host/usuario/contraseña/SSL.                                        |
| `JWT_EXPIRES_IN`                | `60s`..`900s` o minutos equivalentes; predeterminado `15m`.                                                                                                             |
| `REFRESH_TOKEN_EXPIRES_IN_DAYS` | 1..30; predeterminado 7.                                                                                                                                                |
| `BCRYPT_SALT_ROUNDS`            | 10..14; predeterminado 12.                                                                                                                                              |
| `CORS_ORIGINS`                  | Lista separada por comas de orígenes exactos. HTTPS en producción. Sin comodines, rutas, credenciales, fragmentos ni queries. Vacía: no habilita acceso entre orígenes. |
| `TRUSTED_PROXY_CIDRS`           | CIDR concretos de los proxies controlados; vacío significa no confiar en cabeceras reenviadas. Se rechazan `/0` y valores como `true`.                                  |
| `IP_ALLOWLIST`                  | CIDR que pueden entrar a la API. Vacía conserva acceso público sujeto a autenticación y límites.                                                                        |
| `SWAGGER_ENABLED`               | Predeterminado false en producción; habilitarlo es una decisión explícita.                                                                                              |

`NODE_TLS_REJECT_UNAUTHORIZED=0` se rechaza en producción. Para CA privadas,
configurar la confianza del driver mediante el mecanismo del proveedor, por
ejemplo `sslrootcert` en la conexión. No desactivar la verificación del
certificado. La clave de JWT debe ser la misma en las instancias que validan
las mismas sesiones y comparten los contadores.

Las comprobaciones detectan valores evidentemente débiles; no pueden demostrar
que una clave fue generada con entropía suficiente. Generar valores nuevos con
un gestor seguro u `openssl rand -base64 32`. No reutilizar los ejemplos de
documentación como secretos. Codificar los caracteres reservados de las
credenciales cuando formen parte de una URL.

## HTTPS, proxy y base de datos

Terminar TLS en el gateway o reverse proxy. Este debe reconstruir las cabeceras
reenviadas de los clientes y enviar `X-Forwarded-Proto: https`. Registrar
únicamente sus rangos reales en `TRUSTED_PROXY_CIDRS`; no confiar en todas las
redes ni en un número genérico de saltos.

En producción las rutas de API rechazan HTTP con 426. Solo GET/HEAD del health
check `/api/v1` se admite sin HTTPS. Un cliente directo no puede hacer pasar su
petición por HTTPS usando `X-Forwarded-Proto` cuando su conexión no proviene de
un proxy confiable. El backend debe estar en una red privada del gateway; no
exponer directamente sus puertos al público.

El Compose suministrado es para desarrollo local: los puertos de PostgreSQL y
API se publican en `127.0.0.1`; requiere `POSTGRES_PASSWORD` y toma `NODE_ENV`
del entorno, con desarrollo como valor inicial. `CONTAINER_DATABASE_URL` permite
proporcionar una conexión distinta a la construida para el contenedor local.
Una imagen ejecutada en producción necesita un PostgreSQL con TLS y un gateway
HTTPS. No basta con cambiar el modo de ese PostgreSQL local sin configurar TLS.

Usar un rol de migración separado del rol de la aplicación. El rol de runtime
necesita las operaciones de negocio y de contadores/sesiones, pero no
superusuario, `BYPASSRLS`, creación de roles o DDL. Compose crea un usuario de
bootstrap para el PostgreSQL local y no certifica privilegios de producción.

La configuración del cifrado de discos, respaldos, gestión/rotación de claves,
firewall y certificados del proveedor debe comprobarse en infraestructura. Esta
auditoría del repositorio no acredita esas propiedades del servidor productivo.

## Límites de solicitudes

| Política              | Variable                   | Predeterminado                                            |
| --------------------- | -------------------------- | --------------------------------------------------------- |
| Todas las solicitudes | `RATE_LIMIT_GLOBAL`        | 300 por IP/minuto.                                        |
| Login por IP          | `RATE_LIMIT_LOGIN_IP`      | 10 por IP/15 minutos.                                     |
| Login por cuenta      | `RATE_LIMIT_LOGIN_ACCOUNT` | 30 por correo normalizado/15 minutos, entre IP distintas. |
| Registro              | `RATE_LIMIT_REGISTER`      | 10 por IP/hora.                                           |
| Refresh y logout      | `RATE_LIMIT_REFRESH`       | 30 por IP/minuto.                                         |
| POST/PATCH/PUT/DELETE | `RATE_LIMIT_WRITES`        | 60 por IP/minuto, además de los límites anteriores.       |

Los contadores están en PostgreSQL y se incrementan atómicamente entre
instancias. Las claves guardan HMAC, no IP ni correo en claro. IPv4 mapeada se
normaliza; IPv6 se agrupa por `/64`. Los límites agotados devuelven 429,
`Retry-After` y cabeceras de cuota. No se omiten intentos fallidos. Un fallo del
almacén produce error y no habilita solicitudes sin límite.

Los procesos eliminan contadores y refresh tokens vencidos en lotes de hasta
10000 por minuto, mediante índices por vencimiento y sin superponer tareas de
limpieza dentro de una instancia. La eliminación vuelve a comprobar el
vencimiento para conservar una cuota renovada mientras esperaba un bloqueo. Ajustar las cuotas al tráfico real y a redes
compartidas. Un límite de cuenta puede impedir temporalmente el acceso durante
intentos maliciosos; para escenarios mayores considerar un challenge adaptativo.

Estos límites actúan en la aplicación. Protección volumétrica de red, número
máximo de conexiones y timeouts del proxy siguen siendo controles del gateway.
Las instancias deben compartir base, secreto y políticas; no usar réplicas de
lectura para los contadores.

## Entradas y autenticación

Se limita el cuerpo a 16384 bytes. JSON debe ser objeto/array de acuerdo con el
parser y los DTO; las rutas con DTO rechazan estructuras no válidas y campos
extra. El formulario usa parser sin objetos anidados y un máximo de 100
parámetros. Se mantienen `class-validator`, normalización de correo y queries
parametrizadas/Prisma.

Registro y login rechazan contraseñas mayores de 72 bytes UTF-8. El mínimo del
registro sigue siendo ocho caracteres con los requisitos existentes de
complejidad. bcrypt genera salt por hash; el hash auxiliar de login se genera
al iniciar con el factor configurado. Los refresh tokens tienen 32 bytes
aleatorios, se entregan como 64 caracteres hexadecimales y se guardan por SHA-256.

JWT admite únicamente HS256, emisor `noodlevolt-api`, audiencia
`noodlevolt-client`, UUID de sujeto y claims `iat`/`exp` válidos, con duración
máxima de 900 segundos. El rol y la sucursal efectivos se recargan desde
PostgreSQL; no se confía en que el cliente indique esos datos.

La rotación bloquea al usuario, relee el refresh token y revoca/crea el reemplazo
en una transacción. Un reúso confirma la revocación de sus refresh tokens activos
antes de responder 401. Dos renovaciones concurrentes pueden devolver un 200 y
un 401; el reemplazo del primero queda revocado por la detección del segundo.
El frontend debe coordinar una sola renovación en curso y solicitar login ante
esa respuesta. Un fallo de firma o persistencia revierte el intento completo.

Logout revoca el refresh token indicado y es idempotente. Los JWT de acceso
emitidos son stateless y conservan su vigencia de hasta 15 minutos; no existe
denylist de acceso. Desactivar la cuenta sí invalida inmediatamente sus accesos
porque el guard relee al usuario. Si se exige invalidación inmediata por sesión,
se necesita un diseño adicional de sesión/revocación persistente.

Los JWT emitidos por versiones anteriores sin emisor/audiencia se rechazan al
desplegar esta política. Un refresh válido puede obtener el formato nuevo; en
otro caso se requiere login. Las contraseñas antiguas que excedían 72 bytes
necesitan restablecimiento: no se intenta recuperar texto desde sus hashes.

## Datos demo y logs

Para crear usuarios demo fuera de producción se requiere `DEMO_SEED_PASSWORD`
de al menos 12 caracteres y como máximo 72 bytes. No hay contraseña fija. El
seed no cambia contraseñas de usuarios existentes; si anteriormente se usaron
cuentas demo o valores de ejemplo en un despliegue real, el operador debe
retirarlos o rotarlos expresamente. Este trabajo no modificó datos productivos.

Los errores internos de producción responden genéricamente y se registran con
tipo y `X-Request-Id`, sin body, token, URL de conexión ni stack con parámetros
de Prisma. No se emiten logs automáticos de Prisma en producción. Un fallo del
verificador de insumos registra un aviso fijo y mantiene la disponibilidad
cerrada. Las respuestas de autenticación y peticiones con Bearer usan
`Cache-Control: no-store`.

## Verificación y CI

Aplicar `npm run prisma:deploy` y regenerar el cliente antes de arrancar. La tabla
`api_rate_limits` es obligatoria. Su reversión elimina exclusivamente estado
efímero de cuota y el índice nuevo de vencimiento de refresh.

El build rechaza imports/exports de tests y Vitest en runtime, además de
artefactos de pruebas en `dist`. El arranque compilado se comprobó también con
Node fuera del runner de pruebas.

El workflow `security.yml` ejecuta build, tipos, lint, unitarias, E2E de seguridad,
reversión de migraciones y auditoría de dependencias. Fija las acciones oficiales
por SHA, usa permisos de lectura y no recibe secretos de producción. La base de
CI es desechable. La suite E2E global completa se registra por separado porque
mantiene dos fallos anteriores de BE-02.

Comandos relevantes:

```bash
npx tsc --noEmit
npm run build
npm run lint
npm test
npm run test:security
npm run test:migrations
npm audit --audit-level=moderate
node scripts/test-e2e-isolated.mjs
```
