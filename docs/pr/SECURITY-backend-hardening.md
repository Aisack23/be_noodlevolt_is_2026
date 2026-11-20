# security: endurecer entrada HTTP, credenciales, sesiones y dependencias

## Problema y comportamiento resultante

La API no limitaba solicitudes, la rotación de refresh podía emitir reemplazos
concurrentes y el límite de contraseñas ignoraba la truncación por bytes de
bcrypt. También admitía configuraciones de ejemplo o inseguras para producción.
Esta PR aplica controles verificables y documenta los nueve puntos de revisión.

## Qué cambia

- Límites globales y de login, cuenta, registro, refresh/logout y escrituras, compartidos mediante PostgreSQL. Respuestas 429 con `Retry-After`, HMAC de identificadores y tratamiento de IPv6 por `/64`.
- Proxies confiables por CIDR, allowlist IP opcional y rechazo de IP inválida. `X-Forwarded-For` no evita las cuotas desde un cliente directo.
- HTTPS obligatorio para API de producción, con excepción GET/HEAD de health; PostgreSQL requiere `sslmode=verify-full`. Se rechazan opciones TLS ambiguas y la desactivación global de verificación de certificados.
- CORS explícito por origen exacto, sin comodines ni cookies. Antes estaba deshabilitado: no se atribuye un CORS permisivo inexistente al código original.
- Cuerpo máximo de 16 KiB, validación de refresh token de 64 hexadecimales y contraseña de hasta 72 bytes UTF-8, también en el servicio de hash.
- Factor bcrypt 10..14 y hash auxiliar generado con el factor configurado. El salt sigue siendo aleatorio por hash.
- JWT HS256 con emisor/audiencia y `sub`/`iat`/`exp` verificados. Vigencia de acceso 60..900 segundos, refresh de 1..30 días y roles/sucursal recargados desde la base.
- Rotación de refresh atómica con bloqueo y relectura del usuario/token; el reúso confirma la revocación de refresh activos. Un fallo al crear el reemplazo revierte la revocación anterior.
- Retención de contadores y refresh vencidos en lotes, con índices por vencimiento. La limpieza conserva cuotas renovadas mientras espera bloqueos; una regresión con dos conexiones lo comprueba.
- Secretos externos sin defaults válidos; el seed demo exige contraseña externa y rechaza producción. `.env` se ignora en producción, `start:prod` fija el modo antes de importar y los puertos de Compose quedan en loopback.
- Errores de producción redactados, request ID, respuestas de autenticación no cacheables y logs de insumos sin el error completo.
- Dependencias corregidas, Vitest/cobertura 5 y overrides de Undici/tmp acotados al CLI que los requiere. No se usó `npm audit fix --force` ni se degradó el CLI.
- Migración de suites a `describe` y `sequence.concurrent=false`, conservando ejecución no paralela de integración. No se omiten casos.
- Se elimina una exportación de un spec desde reportes que impedía arrancar Node fuera de Vitest. El build comprueba imports y artefactos de runtime para impedir regresiones.
- Workflow de seguridad con acciones oficiales fijadas por SHA y credenciales efímeras de prueba.

## Auditoría solicitada

El informe contiene **nueve hallazgos**, cada uno con severidad, punto afectado,
ubicación en la base, fragmento original, explicación y archivos TypeScript
corregidos completos. Incluye matriz de los nueve criterios y distingue
aislamiento de aplicación de RLS SQL e infraestructura no verificada.

- [Informe y código corregido](https://github.com/Aisack23/be_noodlevolt_is_2026/blob/security/backend-hardening/docs/security/auditoria.md).
- [Inventario por archivo/módulo](https://github.com/Aisack23/be_noodlevolt_is_2026/blob/security/backend-hardening/docs/security/inventario.md): 247 archivos de runtime y 33 declaraciones de rutas.
- [Configuración y operación](https://github.com/Aisack23/be_noodlevolt_is_2026/blob/security/backend-hardening/docs/security/operacion.md).

## Preparación de despliegue

1. Aplicar `npm run prisma:deploy` y regenerar Prisma Client antes de arrancar. Se añade `api_rate_limits` y el índice de expiración de refresh.
2. Proporcionar secretos propios mediante variables del servidor/gestor de secretos. Definir `NODE_ENV=production`; no depender de `.env`.
3. Configurar PostgreSQL con TLS verificado y un gateway HTTPS; declarar sus CIDR concretos en `TRUSTED_PROXY_CIDRS`.
4. Configurar `CORS_ORIGINS` con los orígenes HTTPS exactos del frontend, si corresponde. Ajustar cuotas según tráfico y NAT.
5. Renovar sesiones anteriores sin emisor/audiencia. El frontend debe coordinar una sola renovación en curso y gestionar el 401 por reúso.

No se rotaron secretos ni se modificaron cuentas de un servidor productivo. Si
allí se usaron previamente valores/cuentas demo, el operador debe retirarlos o
rotarlos. Los hashes de contraseñas antiguas que superaban 72 bytes necesitan
restablecimiento; no se recupera texto desde hashes.

## Cómo verificar

Con PostgreSQL 18 exclusivo para pruebas, Prisma Client actualizado y variables
de entorno configuradas:

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

Los scripts de integración aislada y de reversión crean/eliminan exclusivamente
sus bases temporales; necesitan un usuario de prueba con permiso de creación
de bases. La prueba de seguridad HTTP también puede ejecutarse contra una base
exclusiva previamente migrada con `npm run test:security`.

## Resultados locales registrados: 14 de noviembre de 2026

- [x] Tipos (`npx tsc --noEmit`) y build completados correctamente.
- [x] Arranque real de Node con PostgreSQL temporal y health check HTTP aprobado; `start:prod` fuerza producción e ignora `.env`, rechazando secretos ausentes.
- [x] Comprobación del build contra imports/artefactos de pruebas aprobada; YAML del workflow y configuración de Compose válidos. No se construyó la imagen Docker en este entorno.
- [x] Unitarias: **323/323 aprobadas**, 24 suites; 60 casos añadidos de políticas, límites criptográficos y redacción.
- [x] Integración de seguridad: **24/24 aprobadas**, con la misma configuración HTTP del bootstrap, dos instancias, JWT, bcrypt y PostgreSQL reales.
- [x] Casos de HTTP: cuotas compartidas, IP/IPv6 y spoofing, cuenta distribuida entre IP, CORS/preflight, HTTPS, cuerpo acotado, SQL como dato, escalamiento de rol y aislamiento por cliente/sucursal.
- [x] Retención concurrente de cuotas aprobada; la prueba falló al retirar temporalmente la condición protectora y luego se restauró el código corregido.
- [x] Casos de sesión: contrato JWT, hashes de refresh, expiración/desactivación, rotación/reúso, concurrencia forzada mediante `pg_sleep(0.2)`, rollback de reemplazo y logout idempotente.
- [x] Migraciones: aplicar/revertir/reaplicar y ciclo completo aprobados, incluida la nueva migración de seguridad.
- [x] Auditoría de dependencias completa: **0 avisos**. El análisis inicial del árbol de producción registraba 10 (8 altos, 2 moderados).
- [x] Lint: salida 0, con **ocho advertencias preexistentes** en otros archivos. No se declara libre de advertencias.
- [x] Integración global ejecutada: **380 aprobadas y 2 fallidas**, 382 casos en total, 27 suites aprobadas y una fallida, sin casos omitidos.
- [ ] Integración global completamente verde: persisten los dos fallos previos de BE-02 (`pickupAt` y `AT_COUNTER`). No se modifican sus expectativas ni se ocultan.
- [ ] Ejecución del workflow en GitHub: consultar los checks de la rama/PR; esta evidencia corresponde a ejecución local.
- [ ] Infraestructura productiva: no se verificaron certificados reales, reglas de red, privilegios de su rol de DB, cifrado de discos/respaldos ni se realizó despliegue.

Retirar la exportación involuntaria del spec de reportes elimina siete ejecuciones
duplicadas dentro de integración; esos casos siguen incluidos en las unitarias.

Los errores provocados de tabla de contadores inaccesible y de triggers de
rollback forman parte de los casos que pasaron; no son incidentes productivos.

## Límites y decisiones

- El aislamiento SQL RLS no existe en el esquema actual. Se mantiene y prueba autorización de aplicación por identidad y sucursal; no se presenta como RLS implementado.
- Logout revoca refresh; el access JWT conserva su vigencia de hasta 15 minutos. Desactivar la cuenta invalida acceso por la lectura del guard. No se añade denylist de access tokens.
- Las cuotas protegen la capa de aplicación; ataques volumétricos y límites de conexiones/timeouts requieren gateway.
- El job de CI ejecuta la suite específica de seguridad y todas las unitarias; la integración global con los dos fallos previos se informa por separado.
- Se conservan contratos de negocio ajenos a la auditoría y las reglas de las HU existentes. Los nuevos 429/426, validaciones estrictas y requisitos de producción son cambios intencionados.

## Integración

- Rama origen: `security/backend-hardening`.
- Rama destino: `develop`.
- Base revisada: `c11f843`.
- Se requiere la migración `20261114130000_security_rate_limits` antes de iniciar.
- El autor crea el PR y asigna la persona revisora.
