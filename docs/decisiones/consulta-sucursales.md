# Consultas públicas de sucursales

## Contratos

GET /api/v1/branches devuelve todas las sucursales (incluidas inactivas), ordenadas
por nombre e ID. Una base sin sucursales devuelve 200 con []. No se filtra según
el usuario ni se requiere sesión. No hay paginación, de acuerdo con la solicitud
de listado completo.

GET /api/v1/branches/:id devuelve la misma representación para un UUID válido.
UUID inválido responde 400; recurso inexistente responde 404. Una sucursal
inactiva sí existe y su detalle responde 200 con isActive=false e isOpen=false.

```json
{
  "id": "10000000-0000-4000-8000-000000000001",
  "name": "NoodleVolt Centro",
  "address": "San Salvador",
  "timeZone": "America/El_Salvador",
  "isActive": true,
  "isOpen": true
}
```

isOpen es el estado operativo efectivo: isActive && (config?.isOpen ?? false).
Una sucursal sin configuración nunca se anuncia como abierta. No se calcula
apertura con horarios inexistentes ni se modifica configuración durante lecturas.
Solo se seleccionan columnas públicas y config.isOpen en Prisma; el servicio
construye una respuesta explícita sin config, updatedBy, usuarios ni auditoría.

Ambas rutas tienen @Public en el controlador; funcionan sin Bearer o con uno
inválido, como el resto de consultas públicas del proyecto. Las escrituras
siguen protegidas: no se aplica @Public a la clase ni se cambian guards globales.

## Rutas existentes

GET /api/v1/branches/:id/config sigue exponiendo solo isOpen y conserva su
semántica de 404 para inactivas o sin configuración. No se agrega un alias de
disponibilidad porque ya existe esta consulta. PATCH sobre el mismo recurso
sigue exigiendo gerente de la sucursal y manteniendo auditoría.

No se implementan altas/bajas ni edición pública. No se cambia schema,
migraciones ni dependencias. BranchRepository conserva sus métodos existentes
y agrega dos lecturas con select público y orden determinista. Se elimina una
importación Prisma sin uso y se explicita su inyección para consistencia y tests.

## Revisión y validación

- 12 tests de servicio y HTTP con guard JWT real aprobados; repositorio simulado.
- Se prueban acceso público, Bearer inválido, lista vacía, 400, 404, estado cerrado,
  inactivas, ausencia de configuración, propagación de errores y Swagger.
- Lint sin tipos de los archivos revisados: sin incidencias.
- Lint global con tipos: exit 0 con advertencias; el cliente Prisma ausente
  impide considerar terminada la auditoría de tipos.
- Build: falla por Prisma Client no generado.
- Suite real AppModule/PostgreSQL: falla al inicializar; 3 casos omitidos.
- No se ha configurado ni verificado CI para esta entrega.

Antes de aprobar se debe regenerar Prisma Client, aplicar las migraciones
existentes y repetir build e integración real. Las pruebas aisladas no prueban
la ejecución de consultas Prisma contra la base.
