# feat(BE-11): listado y detalle público de sucursales

## Qué cambia

- Se implementa GET /api/v1/branches con listado completo, incluidas inactivas, ordenado por nombre e ID.
- Se añade GET /api/v1/branches/:id para consultar información básica y estado de una sucursal.
- La respuesta contiene id, name, address, timeZone, isActive e isOpen.
- isOpen es false cuando la sucursal está inactiva, cerrada o sin configuración.
- Ambas consultas son públicas; no requieren JWT y permiten Bearer inválido.
- Se seleccionan únicamente datos públicos, sin exponer usuarios ni auditoría.
- Se valida UUID y se distinguen errores 400/404 de listado vacío 200 con [].
- Se elimina una importación sin uso y se explicita la inyección de BranchRepository.
- Se agregan pruebas y documentación Swagger y técnica.

## Endpoints complementarios y alcance

- La consulta de disponibilidad ya existe en GET /branches/:id/config y se reutiliza, sin crear alias duplicados.
- Se conservan la semántica y los permisos de GET/PATCH /branches/:id/config.
- No se añaden escrituras, modelos, migraciones ni dependencias.
- El listado incluye inactivas según el requisito de listado completo; el frontend puede descartarlas mediante isActive para seleccionar dónde pedir.

## Cómo probarlo

Usar PostgreSQL exclusivo de pruebas y las variables requeridas por el proyecto:

```bash
npm ci
npm run prisma:generate
npm run prisma:deploy
npm run build
npm run lint
npx vitest run src/branches/services/branches-query.spec.ts
npx vitest run --config vitest.config.e2e.ts test/db-branches-query.e2e-spec.ts
```

Verificar GET /api/v1/branches sin sesión, detalle con UUID válido, 400 con ID inválido y 404 con UUID inexistente. Confirmar que una sucursal cerrada o sin configuración no se muestre abierta.

## Resultados registrados

- [x] **12/12 pruebas de servicio y HTTP aprobadas**, con guard JWT real y persistencia simulada.
- [x] Lint sin tipos de los archivos revisados: sin incidencias.
- [x] Lint global con tipos: exit 0, con advertencias preexistentes y asociadas a Prisma Client ausente. No es una auditoría de tipos completa.
- [x] git diff --check: sin incidencias.
- [ ] **Build fallido**: falta Prisma Client y sus tipos generados.
- [ ] **Integración real no completada**: suite fallida durante inicialización; **3 casos omitidos**.
- [ ] Suite global de pruebas y CI no ejecutados/verificados en esta entrega.

**Antes de aprobar:** regenerar Prisma Client y completar build y la suite real. El entorno venía bloqueado para descargar Prisma desde binaries.prisma.sh; no se han deshabilitado checksums ni TLS. No se afirma que todos los tipos ni el endpoint contra PostgreSQL estén validados.

## Integración

- Rama origen: feat/BE-11-extra-endpoints.
- Rama destino: develop.
- Base: 447241519702772666dd6dc478987900e2a8550b.
- El autor crea el PR y asigna reviewer.
- Documentación: docs/decisiones/consulta-sucursales.md.
