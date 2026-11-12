# test(QA-10): validar BE-10 integrado y registrar discrepancia de propinas

## Qué cambia

- Se actualiza test/QA-10-sales con develop f197a9c, que ya incluye BE-10/DB-10 y GET /api/v1/reports/sales.
- Se confirma el contrato from, to, branchId, total y paymentsCount en las aserciones.
- Se mantienen los 14 casos y los valores esperados sin propinas indicados por QA-10 del PDF.
- Se extiende el runner aislado para aceptar argumentos Vitest. Sin argumentos mantiene test:e2e; con --config permite QA-10 en PostgreSQL temporal migrado.
- Se actualiza un fixture unitario de pagos con la nueva dependencia de lealtad del constructor, resolviendo TS2554 sin modificar aplicación.
- Se reemplaza el informe anterior de ruta ausente por evidencias reales y la discrepancia QA10-001.
- No se cambia lógica de negocio, schema, migraciones ni dependencias.

## Aclaración del commit anterior

209892b pertenece a test/QA-10-sales: era la preparación de QA basada en un
develop anterior sin BE-10. No fue una implementación ni una fusión automática
en develop. Ahora la rama QA integra la versión f197a9c y el endpoint sí existe.

## Cómo repetirlo

Con Prisma Client generado y DATABASE_URL de PostgreSQL con permiso para crear bases temporales:

```bash
npx tsc --noEmit
npm run build
npm run lint
npm test
node scripts/test-e2e-isolated.mjs --config vitest.config.qa-sales.ts
```

Para una base exclusiva de pruebas ya migrada:

```bash
npx vitest run --config vitest.config.qa-sales.ts
```

La suite es explícita; ejecutar solo npm test o test:e2e no valida QA-10.

## Resultados del 12 de noviembre de 2026

- [x] PostgreSQL disponible y Prisma Client regenerado; no hay errores por tipos ausentes.
- [x] npx tsc --noEmit: aprobado.
- [x] npm run build: aprobado.
- [x] Unitarias globales: **234/234 aprobadas**, 20 suites.
- [x] E2E existentes de BE-10/DB-10: **6/6 aprobadas**, 2 suites.
- [x] QA-10 ejecuta los 14 casos sobre PostgreSQL temporal, sin omisiones ni 404 inesperados.
- [ ] **QA-10 totalmente verde: 11 aprobadas y 3 fallidas.**
- [x] Lint global: exit 0, con ocho advertencias previas; no se declara sin advertencias.
- [x] git diff --check: sin incidencias.
- [ ] E2E global, FE-10 y CI no verificados en esta revisión.

## Discrepancia pendiente QA10-001

BE-10 suma totalPaid. Un pago del fixture tiene subtotal=10.10, tip=5.00 y
totalPaid=15.10. El PDF, en QA-10, pide comprobar la suma sin propinas.

| Consulta | Esperado sin propina | Recibido |
|---|---|---|
| Gerente A, sucursal implícita | 30.30 | 35.30 |
| Gerente A, sucursal explícita | 30.30 | 35.30 |
| Gerente general consolidado | 38.00 | 43.00 |

Las tres fallas corresponden a la misma causa, no a tres errores independientes.
Rango invertido, rol, aislamiento, zona de sucursal B, total cero y filtros
inválidos pasan. Los conteos de pagos y la exclusión de rechazados/cancelados
coinciden con los fixtures. No se cambiaron los esperados para ocultar propinas.

**Antes de aprobar funcionalmente:** acordar el importe comercial con BE-10,
corregir la implementación o documentar el cambio de requisito y repetir los
14 casos. HU-10 no se declara completamente aceptada mientras exista esta
contradicción y falte la revisión frontend.

## Integración

- Rama origen: test/QA-10-sales.
- Rama destino: develop.
- Se conserva el historial de 209892b y se integra el develop actual.
- El autor crea el PR y asigna reviewer.
- Matriz, cálculo manual y evidencia: docs/qa/QA-10-sales.md.
