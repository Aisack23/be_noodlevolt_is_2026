# QA-10: consultar ventas pagadas por fechas

## Estado actual: 12 de noviembre de 2026

Responsable QA: Isaac. Rama test/QA-10-sales, actualizada con develop
f197a9c9630c248bc618ac434881d29a8f590557.

209892b es el commit de preparación de esta rama QA; no se fusionó por esta tarea
en develop. BE-10 ya está integrado en develop por el PR #39, junto con DB-10.
La ausencia de endpoint registrada antes quedó resuelta. Se repitieron los 14
casos contra GET /api/v1/reports/sales y ya no hay respuestas 404 inesperadas.

Resultado actual: 11 pruebas aprobadas y 3 fallidas, ninguna omitida. Las tres
fallan por la misma discrepancia de propinas descrita más abajo. No se cambió
lógica de aplicación ni se relajaron aserciones para obtener una suite verde.

## Contrato confirmado

Se verificó docs/contratos/reporte-ventas.md y Swagger de BE-10:

- GET /api/v1/reports/sales?from=YYYY-MM-DD&to=YYYY-MM-DD&branchId=<uuid>.
- BRANCH_ADMIN consulta su sucursal; GENERAL_MANAGER puede elegir otra o consolidar.
- Respuesta: from, to, branchId (null para consolidado), total string decimal y paymentsCount.
- Días locales inclusivos convertidos a intervalo UTC semiabierto por sucursal.
- Se suman solo PAID y se excluyen pedidos CANCELED.
- Rango máximo 366 días, validaciones 400, sesión 401 y permisos 403.

La forma JSON ya no es provisional. La regla «sin propinas» del apartado QA-10
del PDF sigue requiriendo alineación: el código BE-10 agrega totalPaid, que las
incluye en el fixture. No se reinterpretó la especificación para ocultarlo.

## Datos y cálculo manual

Día: 2030-01-10. A: America/El_Salvador, intervalo UTC
[2030-01-10T06:00:00Z, 2030-01-11T06:00:00Z). B: America/New_York,
[2030-01-10T05:00:00Z, 2030-01-11T05:00:00Z).

| Sucursal | Pago | Pedido | Importe comercial | Fecha pago UTC | Incluir |
|---|---|---|---|---|---|
| A | PAID | PENDING | 10.10 | 10 enero 06:00:00 | Sí, inicio inclusivo |
| A | PAID | DELIVERED | 20.20 | 11 enero 05:59:59.999 | Sí |
| A | REJECTED | PENDING | 99.99 | 10 enero 12:00:00 | No |
| A | PAID | CANCELED | 40.00 | 10 enero 12:00:00 | No |
| A | PAID | PENDING | 50.00 | 10 enero 05:59:59.999 | No, día anterior |
| A | PAID | PENDING | 60.00 | 11 enero 06:00:00 | No, fin exclusivo |
| B | PAID | PENDING | 7.70 | 10 enero 05:00:00 | Solo B/consolidado |

El primer pago tiene tip=5.00 y totalPaid=15.10. Sin propinas, A=30.30, B=7.70,
consolidado=38.00. Todos los descuentos son cero; no se inventa una regla de
cálculo de descuentos. Cada pago usa un pedido distinto; UUID propios y cleanup
solo de esas filas. La base temporal se elimina al finalizar incluso con exit 1.

## Matriz ejecutada

| Caso | Esperado | Observado | Resultado |
|---|---|---|---|
| Suma A y exclusiones | 200, 30.30, 2 pagos | 200, 35.30, 2 pagos | Falla: incluye 5.00 de propina |
| Sucursal propia explícita | 200, 30.30 | 200, 35.30 | Misma discrepancia |
| Sin ventas | 200, 0.00 | 200, 0.00 | Aprobado |
| Inicio posterior al fin | 400 | 400 | Aprobado |
| Gerente consulta otra sucursal | 403 | 403 | Aprobado |
| General selecciona B con zona propia | 200, 7.70 | 200, 7.70 | Aprobado |
| General consolida | 200, 38.00, 3 pagos | 200, 43.00, 3 pagos | Incluye la misma propina |
| Gerente B | 200, 7.70 | 200, 7.70 | Aprobado |
| Cliente autenticado | 403 | 403 | Aprobado |
| Sin sesión | 401 | 401 | Aprobado |
| Fecha imposible | 400 | 400 | Aprobado |
| Falta from | 400 | 400 | Aprobado |
| branchId inválido | 400 | 400 | Aprobado |
| Fecha-hora en lugar de día | 400 | 400 | Aprobado |

## Discrepancia QA10-001: propinas incluidas

Archivo: src/reports/repositories/sales-report.repository.ts.
Causa: _sum: { totalPaid: true }. El fixture diferencia totalPaid=15.10 de
subtotal=10.10, tip=5.00. La consulta devuelve 35.30 para A y 43.00 consolidado,
exactamente 5.00 por encima de la referencia sin propinas.

Los filtros PAID/no CANCELED, fechas y sucursal están presentes y los conteos
son correctos. El fallo no es falta de Prisma, conexión ni red. No se corrigió
BE-10 desde la rama QA. Se requiere acordar con BE-10 el importe comercial y
su relación con propinas/descuentos; si el requisito cambia, actualizar primero
la decisión documentada del equipo, luego las pruebas. No basta cambiar los
esperados a 35.30/43.00 sin justificarlo.

## Entorno y verificaciones

- Entorno recuperado, PostgreSQL activo y Prisma generado para el schema actual.
- npx tsc --noEmit y npm run build: aprobados.
- Unitarias globales: 234/234 aprobadas, 20 suites.
- Suites existentes de API/DB de reportes: 6/6 aprobadas, 2 suites.
- QA-10: 11 aprobadas, 3 fallidas; 1 suite fallida y cero casos omitidos.
- Lint global exit 0 con ocho advertencias previas; no se declara limpio.
- Se actualizó únicamente el doble de lealtad del test de pagos al constructor
  actual de dos argumentos; no se cambió su implementación ni se ocultaron errores.
- No se ejecutó E2E global ni frontend/CI en esta revisión.

## Repetir pruebas

```bash
node .tmp/generate-local.cjs
npx tsc --noEmit
npm run build
npm run lint
npm test
node scripts/test-e2e-isolated.mjs --config vitest.config.qa-sales.ts
```

La generación WASM local es específica del entorno cloud; en un entorno con
acceso nativo se puede usar npm run prisma:generate. El runner versionado ahora
acepta argumentos Vitest: crea una base temporal, aplica migraciones, ejecuta
QA-10, conserva exit code y elimina la base. Sin argumentos conserva el comando
original test:e2e. DATABASE_URL requiere permiso para crear bases de pruebas.

Alternativa, con una base exclusiva ya migrada:

```bash
npx vitest run --config vitest.config.qa-sales.ts
```

QA-10 sigue siendo una suite explícita; npm test/test:e2e por defecto no la
incluyen. Ejecutarla es obligatorio antes de aprobar QA-10.

## Pendientes de cierre

- Resolver/documentar QA10-001 y repetir los 14 casos sin relajar la especificación.
- Validar frontend FE-10 y registrar evidencia de pantalla y permisos.
- Adjuntar evidencias en Trello con fecha, ambiente y SHA; no se publicó nada allí.
