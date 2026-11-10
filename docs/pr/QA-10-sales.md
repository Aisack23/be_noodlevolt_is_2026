# test(QA-10): preparar aceptación de reportes y documentar dependencia BE-10

## Qué cambia

- Se incorpora una suite de aceptación para GET /api/v1/reports/sales con 14 casos, JWT real y fixtures PostgreSQL.
- Se preparan aprobados, rechazados, cancelados, dos sucursales y fronteras de días locales.
- Se cubren total decimal, exclusión de propinas, aislamiento, gerente general, total cero y validación de fechas.
- Se añade configuración explícita vitest.config.qa-sales.ts y matriz con cálculo manual en docs/qa/QA-10-sales.md.
- No se modifica código de aplicación, schema, migraciones ni dependencias.

## Dependencia bloqueante

En develop b2581f3d463d7d5bcf2b1da62322c930bfdb4471 no existe el endpoint BE-10.
Esta entrega corresponde a QA-10, no implementa BE-10 (asignado a Abraham en el
PDF). La ausencia de la ruta se verificó en código y mediante solicitudes reales.

El PDF no define nombres de campos de respuesta. Se propone total como string
con dos decimales para las aserciones; debe confirmarse con BE-10/Swagger. No se
presenta esa propuesta como un contrato ya aprobado por el equipo.

## Cómo probarlo

Con Prisma Client generado, migraciones aplicadas y DATABASE_URL de una base
PostgreSQL exclusiva para pruebas:

```bash
npx vitest run --config vitest.config.qa-sales.ts
```

La suite es explícita y no se incluye en los comandos predeterminados npm test
ni test:e2e. Es obligatorio ejecutar este comando antes de aprobar QA-10.

## Resultados

- [x] Fixtures creados y limpiados correctamente en PostgreSQL temporal.
- [x] Se ejecutaron los 14 casos, sin omitir ni deshabilitar pruebas.
- [x] Lint con tipos y comprobación TypeScript acotada a la suite/config nuevas: sin incidencias.
- [x] npm run build: aprobado.
- [ ] npx tsc --noEmit global: falla por el cierre faltante previo en test/db-reservations-booking.e2e-spec.ts:258. No se modificó ese archivo.
- [ ] **14/14 casos fallidos:** todos recibieron 404 porque BE-10 no está implementado. La suite NO pasó.
- [ ] CA1, CA2 y CA3 no pueden darse por aceptados.
- [ ] Integración FE-10 y CI no ejecutadas/verificadas.

No se cambiaron las expectativas para hacer pasar una API ausente. El total
manual esperado es 30.30 para A, 7.70 para B y 38.00 consolidado; la primera venta
incluye una propina de 5.00 que no se suma al reporte comercial.

## Antes de aprobar

- [ ] Disponer de DB-10/BE-10 y acordar el contrato JSON.
- [ ] Ajustar las aserciones al contrato acordado y obtener las 14 pruebas aprobadas.
- [ ] Verificar FE-10 y guardar evidencias en Trello.

## Integración

- Rama origen: test/QA-10-sales.
- Rama destino: develop.
- Mantener como revisión de preparación de QA; no considerar la HU terminada ni el PR listo para aprobación funcional mientras falte BE-10.
- El autor crea el PR y asigna reviewer.
