# QA: correcciones de pedidos, arranque y tipado

Rama: `fix/backend-polish`. Base: `c11f843` de `develop`.

Validación local: 14 de noviembre de 2026, `America/El_Salvador`.

## Evidencia anterior a la corrección

Se ejecutaron los 16 casos existentes de `test/db-orders.e2e-spec.ts` contra una base temporal con todas las migraciones aplicadas:

- 14 aprobados.
- 2 fallidos: ONLINE devolvía `pickupAt: null`; AT_COUNTER devolvía `paymentMode: ONLINE`.
- El lint tenía ocho advertencias: una constante sin uso, conversión monetaria desde `unknown`, referencia de método desasociada y cinco `await` de valores síncronos.

## Matriz de casos

| Caso                                     | Evidencia                                                                                                                      | Resultado                                                                       |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| Crear ONLINE y AT_COUNTER                | `test/db-orders.e2e-spec.ts`; HTTP 201 y lectura directa de modalidad, estado y fecha en PostgreSQL.                           | Aprobado en ambas modalidades.                                                  |
| Retiro en veinte minutos                 | Fecha retornada dentro del intervalo medido por el test y comparación con `pickup_at` persistido.                              | Aprobado.                                                                       |
| Modalidad omitida                        | HTTP 201 con ONLINE y fecha válida; repetir con ONLINE explícito devuelve 200 y el mismo recurso; una sola fila por operación. | Aprobado.                                                                       |
| Reintento tras cambio de precio o cierre | Casos ONLINE/AT_COUNTER comparan toda la respuesta con la creación original.                                                   | Aprobado.                                                                       |
| Cambiar modalidad con la misma clave     | HTTP 409 y contrato de idempotencia existente.                                                                                 | Aprobado.                                                                       |
| Concurrencia e integridad                | Casos existentes de operación duplicada, cierre concurrente y solicitudes rechazadas sin persistencia.                         | Aprobado.                                                                       |
| Importe de pedidos propios               | `test/db-my-orders.e2e-spec.ts`; consulta HTTP de valores `0.01`, `999999999999.99` y total histórico nulo.                    | `0.01`, `999999999999.99` y `0.00`, respectivamente.                            |
| Propietario y permisos                   | Casos existentes de pedidos ajenos, sesión ausente y rol de personal.                                                          | Aprobado.                                                                       |
| Exportaciones del build                  | `scripts/check-runtime-imports.mjs` analiza el AST de runtime y los archivos de `dist`.                                        | Sin referencias a specs ni Vitest.                                              |
| Arranque real                            | Servidor compilado ejecutado mediante Node, con PostgreSQL temporal; petición a `GET /api/v1`.                                 | HTTP 200, `Hello World!`; cierre del proceso y eliminación de su base temporal. |

## Resultado final

| Verificación               | Resultado                                          |
| -------------------------- | -------------------------------------------------- |
| Tipos                      | Correctos.                                         |
| Build                      | Correcto.                                          |
| Lint                       | 0 errores y 0 advertencias.                        |
| Unitarias                  | 263/263, 22 suites.                                |
| E2E específicas de pedidos | 27/27, 2 suites.                                   |
| E2E global                 | 363/363, 27 suites; incluye los casos específicos. |
| CI remoto                  | No verificado.                                     |

Se conservaron los logs locales de baseline, generación, tipos, build, lint, unitarias, E2E y arranque real en el paquete `BACKEND-polish-validacion`. El paquete no contiene `.env`, claves JWT ni URLs de conexión. Los archivos de logs no se incorporan al código fuente.

No se modificó el esquema. Las bases temporales se crearon aplicando todas las migraciones existentes; no se ejecutó de nuevo la reversión de migraciones, porque esta corrección no cambia ninguna.
