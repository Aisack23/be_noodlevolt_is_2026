# QA-10: consultar ventas pagadas por fechas

## Estado

Responsable QA: Isaac. Rama test/QA-10-sales, base develop
b2581f3d463d7d5bcf2b1da62322c930bfdb4471.

DB-10, BE-10 y FE-10 son dependencias de la tarea. No existe GET
/api/v1/reports/sales en la base inspeccionada ni se encontró rama remota BE-10.
No se implementó lógica de aplicación en este trabajo de QA.

Se ejecutaron 14 casos de aceptación con AppModule, JWT y PostgreSQL reales,
en base temporal con migraciones. Todos fallaron con 404 por ruta inexistente.
No son 14 defectos de negocio independientes: comparten el bloqueo de BE-10.
Ninguno de los tres criterios queda aprobado. No se omitieron casos ni se
sustituyeron las expectativas por 404 para conseguir una ejecución verde.

## Contrato provisional de pruebas

GET /api/v1/reports/sales?from=YYYY-MM-DD&to=YYYY-MM-DD&branchId=<uuid>.
BRANCH_ADMIN equivale a GERENTE; GENERAL_MANAGER a GERENTE_GENERAL. Rango
inclusivo de días locales, convertido a intervalo UTC semiabierto por sucursal.

El PDF define rutas, filtros, permisos y cálculo, pero no nombra los campos JSON.
La suite propone total como string decimal de dos posiciones (ejemplo
{"total":"30.30"}). BE-10 debe confirmar/documentar ese nombre en Swagger antes
de tratar estas aserciones de cuerpo como un contrato acordado.

Se interpreta «sin propinas» del QA como importe comercial, no totalPaid con
propina. Los fixtures usan discount=0 para no inventar una regla sobre descuentos;
esa regla también debe documentarse con BE-10 si se habilitan descuentos.

## Datos y cálculo manual

Día consultado: 2030-01-10. Sucursal A: America/El_Salvador, intervalo UTC
[2030-01-10T06:00:00Z, 2030-01-11T06:00:00Z). Sucursal B: America/New_York,
intervalo [2030-01-10T05:00:00Z, 2030-01-11T05:00:00Z).

| Sucursal | Estado pago | Estado pedido | Importe sin propina | Fecha pago UTC | Incluir |
|---|---|---|---|---|---|
| A | PAID | PENDING | 10.10 | 10 enero 06:00:00 | Sí, frontera inicial |
| A | PAID | DELIVERED | 20.20 | 11 enero 05:59:59.999 | Sí, última fracción del día |
| A | REJECTED | PENDING | 99.99 | 10 enero 12:00:00 | No, rechazado |
| A | PAID | CANCELED | 40.00 | 10 enero 12:00:00 | No, cancelado |
| A | PAID | PENDING | 50.00 | 10 enero 05:59:59.999 | No, día anterior local |
| A | PAID | PENDING | 60.00 | 11 enero 06:00:00 | No, fin exclusivo |
| B | PAID | PENDING | 7.70 | 10 enero 05:00:00 | Solo B o consolidado |

El primer pago tiene propina 5.00 y totalPaid=15.10. El total comercial esperado
para A es 10.10+20.20=30.30, no 35.30. B=7.70; consolidado=38.00. Cada pago usa
un pedido distinto; el índice único parcial evita aprobados duplicados por pedido.
Se reservan UUID propios y se eliminan solo los fixtures de esta suite al cerrar.

## Matriz

| Caso | Esperado | Observado | Estado |
|---|---|---|---|
| CA1/CA2: suma A y exclusiones | 200, total 30.30 | 404 | Bloqueado por BE-10 |
| Sucursal propia explícita | 200, total 30.30 | 404 | Bloqueado |
| Sin ventas | 200, total 0.00 | 404 | Bloqueado |
| CA3: rango invertido | 400 | 404 | Bloqueado |
| Gerente consulta sucursal ajena | 403 | 404 | Bloqueado |
| General selecciona B con zona propia | 200, total 7.70 | 404 | Bloqueado |
| General consolida todas | 200, total 38.00 | 404 | Bloqueado |
| Gerente B consulta su sucursal | 200, total 7.70 | 404 | Bloqueado |
| Cliente autenticado | 403 | 404 | Bloqueado |
| Sin sesión | 401 | 404 | Bloqueado |
| Fecha inexistente | 400 | 404 | Bloqueado |
| Sin fecha inicial | 400 | 404 | Bloqueado |
| branchId inválido | 400 | 404 | Bloqueado |
| Fecha-hora en lugar de día | 400 | 404 | Bloqueado |

## Ejecución

La suite es de aceptación y se ejecuta explícitamente con
vitest.config.qa-sales.ts. No forma parte de npm test ni de test:e2e por su
sufijo .qa-spec.ts. Esta separación está documentada y no permite declarar QA-10
aprobada por ejecutar únicamente las suites predeterminadas.

Con una base exclusiva de pruebas migrada y variables requeridas:

```bash
npx vitest run --config vitest.config.qa-sales.ts
```

La ejecución registrada utilizó una base temporal migrada y preservó el exit
code 1 de Vitest. Inicialización/fixtures y cleanup terminaron; resultado:
1 suite fallida, 14 tests fallidos por 404, cero omitidos.

## Pendientes para cierre

- Implementar BE-10 y validar los índices con DB-10, sin crear tablas de totales.
- Confirmar respuesta JSON, propinas/descuentos y consolidación por zona local.
- Integrar FE-10 y registrar filtros, total cero, errores y permisos visuales.
- Repetir los 14 casos; no marcar criterios aceptados con la ruta ausente.
- Adjuntar evidencias finales en Trello con ambiente, fecha y SHA. Esta tarea no
  publicó mensajes ni evidencias en Trello desde herramientas.

## Comprobaciones adicionales

- Comprobación TypeScript acotada a la suite/config nuevas: aprobada.
- npm run build: aprobado (el build excluye archivos de pruebas).
- npx tsc --noEmit global: falla por un error ya presente en la base,
  test/db-reservations-booking.e2e-spec.ts:258, falta cierre `}`. No se modificó
  ese archivo ni se atribuyó el fallo a la nueva suite.
