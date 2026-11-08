
# QA-01 — Validación del menú público

## Identificación

- Proyecto: NoodleVolt
- Sprint: 1
- Historia: HU-01 — Consultar menú disponible
- Tarea: QA-01
- Responsable: Isaac
- Rama: test/QA-01-menu
- Entorno: desarrollo / PostgreSQL local
- Fecha de ejecución: PENDIENTE
- Commit probado: PENDIENTE

## Contrato evaluado

GET /api/v1/sucursales/:sucursalId/menu

Fuente:
docs/decisiones/menu-publico.md

El endpoint no requiere autenticación.

## Matriz de casos

| ID | Escenario | Esperado | Resultado |
|---|---|---|---|
| QA01-01 | Consulta sin JWT | 200 | Pendiente |
| QA01-02 | Bearer inválido | 200 | Pendiente |
| QA01-03 | Sucursal activa | 200 | Pendiente |
| QA01-04 | Sucursal inexistente | 404 | Pendiente |
| QA01-05 | UUID inválido | 400 | Pendiente |
| QA01-06 | Sucursal inactiva | 404 | Pendiente |
| QA01-07 | Sucursal sin platos visibles | categorias: [] | Pendiente |
| QA01-08 | Plato AVAILABLE | Disponible según verificador | Pendiente |
| QA01-09 | Plato SOLD_OUT | disponible=false | Pendiente |
| QA01-10 | Plato DISABLED | No aparece | Pendiente |
| QA01-11 | Categoría inactiva | No aparece | Pendiente |
| QA01-12 | Sucursales diferentes | Precios y platos propios | Pendiente |
| QA01-13 | Orden de categorías | displayOrder ascendente | Pendiente |
| QA01-14 | Orden de platillos | Nombre ascendente | Pendiente |
| QA01-15 | Precios | String con dos decimales | Pendiente |
| QA01-16 | Error de verificador | 200 y todos no disponibles | Pendiente |
| QA01-17 | Actualización de precio | Nuevo precio en siguiente consulta | Pendiente |
| QA01-18 | Swagger | Ruta, parámetros y errores documentados | Pendiente |
| QA01-19 | Fallo de PostgreSQL | Error controlado; sin datos sensibles | Pendiente |
| QA01-20 | Recuperación de PostgreSQL | Servicio vuelve a responder | Pendiente |

## Ejecución automática

Comandos:

```bash
npm run lint
npm run build
npm test
npm run test:db
```

Resultados:

- lint: PENDIENTE
- build: PENDIENTE
- test: PENDIENTE
- test:db: PENDIENTE

Registrar número de pruebas superadas y fallidas.

## Validación manual con Bruno

Variables:

- baseUrl
- sucursalId

Petición:

GET {{baseUrl}}/sucursales/{{sucursalId}}/menu

Comprobar:

- HTTP status.
- JSON de respuesta.
- Filtrado por sucursal.
- Disponibilidad.
- Precios.
- Ausencia de errores internos.

No guardar credenciales ni tokens reales
en capturas o documentos de evidencia.

## Dependencias

### Inventario

El adaptador AlwaysSufficientIngredientChecker
es temporal y no verifica stock real.

La validación definitiva depende de BE-5.1.1.

### Contrato alternativo

La planificación menciona:

GET /api/v1/dishes?status=active

El contrato implementado es:

GET /api/v1/sucursales/:sucursalId/menu

La diferencia requiere confirmación del equipo.

## Defectos

| ID | Descripción | Severidad | Estado |
|---|---|---|---|
| — | Sin defectos registrados aún | — | Pendiente |

## Conclusión

Estado: PENDIENTE DE EJECUCIÓN

La aprobación requiere:

1. Ejecutar pruebas automáticas.
2. Completar pruebas manuales.
3. Registrar evidencias.
4. Resolver o aceptar formalmente los defectos.
5. Confirmar el contrato definitivo de HU-01.
