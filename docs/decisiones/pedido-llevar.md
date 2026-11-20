# BE-2.2.1: completar el pedido para llevar

## Consolidación

Se conserva el historial de feat/be-2.2.1-pedido-llevar y se integra develop.
La implementación utiliza únicamente POST /api/v1/orders, ya integrado por BE-02.
El módulo duplicado TakeoutOrdersModule, sus adaptadores temporales y sus tests
se sustituyen por la implementación y pruebas ampliadas de OrdersModule.
No se exponen dos rutas distintas que creen el mismo recurso con permisos,
estados y errores diferentes. La ruta /api/v1/pedidos-llevar no se publica.

Se rescatan del trabajo anterior la modalidad de pago, comprobación del precio
visto por el cliente y hora estimada de retiro. El retiro se devuelve como ISO
8601 UTC para que frontend lo presente en la zona de la sucursal. La estimación
es orientativa y se fija una vez al crear el pedido, veinte minutos después.

## Solicitud

```json
{
  "branchId": "10000000-0000-4000-8000-000000000001",
  "operationKey": "20000000-0000-4000-8000-000000000001",
  "paymentMode": "AT_COUNTER",
  "lines": [
    {
      "dishId": "30000000-0000-4000-8000-000000000001",
      "quantity": 2,
      "expectedPrice": "8.50"
    }
  ]
}
```

paymentMode admite ONLINE y AT_COUNTER; por omisión es ONLINE. Es obligatorio
persistirlo para TAKEOUT debido al CHECK existente. expectedPrice es opcional;
si se envía debe ser texto decimal con hasta ocho enteros y dos decimales. Sirve
para detectar un precio cambiado, nunca como precio de cobro. Si no coincide con
la base se responde 409 con prices: [{dishId, currentPrice}]. El cálculo de total
y precios históricos usa exclusivamente datos del servidor y Prisma.Decimal.

La respuesta conserva los campos de BE-02 y añade paymentMode y pickupAt. Estos
pueden ser null en respuestas de pedidos anteriores sin esos datos. Un pedido
nuevo siempre guarda modalidad y fecha de retiro y comienza PENDING, incluso
ONLINE. El estado del pago se consulta en pagos; no se marca como pagado al crear.

## Migración del cliente de la rama antigua

- POST /pedidos-llevar pasa a POST /orders bajo /api/v1.
- Idempotency-Key pasa a operationKey en el cuerpo.
- sucursalId pasa a branchId.
- modalidadPago EN_LINEA/EN_CAJA pasa a paymentMode ONLINE/AT_COUNTER.
- lineas[].platilloId/cantidad/precioEsperado pasa a lines[].dishId/quantity/expectedPrice.
- estado/total/horaRetiro pasa a status/total/pickupAt; el total sigue siendo string decimal.
- Los conflictos de negocio e idempotencia usan 409; no se devuelve 422.

El frontend debe usar el contrato en inglés. No se mantienen alias temporales
que permitan seguir creando pedidos con las reglas antiguas.

## Seguridad e integridad

Se mantiene JWT real del boilerplate y el usuario se relee desde PostgreSQL.
OrdersService solo admite CLIENT; no se reciben userId, role, total ni status.
Las cantidades son enteros 1..20, hay 1..100 líneas y no se permiten platillos
repetidos, incluyendo UUID con diferencias de mayúsculas.

La transacción y locks de BE-02 se reutilizan: advisory lock por operationKey,
FOR SHARE sobre sucursal/configuración y platillos/categorías. Se comprueba
isOpen dentro de la misma transacción y se rechazan sucursales inactivas,
platillos ajenos, eliminados, no disponibles, agotados y categorías inactivas.
Los errores siguen 400/401/403/404/409, documentados en Swagger.

La huella incluye propietario, sucursal, clave, líneas y modalidad. ONLINE
por omisión conserva la huella del contrato previo de BE-02 para solicitudes
sin expectedPrice. ONLINE explícito equivale a omitido; AT_COUNTER distingue
otra solicitud. Los UUID, orden de líneas y representaciones decimales se
normalizan. Un reintento idéntico devuelve 200 y conserva snapshot, modalidad,
fecha y total; otro contenido devuelve 409 sin exponer pedidos ajenos.

No se agrega migración ni dependencia nueva. Se utiliza el schema de develop.
El inventario real por cantidades agregadas sigue pendiente de su integración:
esta tarea valida disponibilidad del platillo, no descuenta existencias ni
simula hacerlo con un adaptador Noop.

## Pruebas y resultados

Validación local del 7 de noviembre de 2026:

- 34/34 pruebas de lógica y HTTP con guard JWT real: aprobadas; persistencia simulada.
- Lint sin tipos de los archivos de pedidos: sin incidencias.
- Lint global con tipos: exit 0 con advertencias preexistentes y derivadas del cliente Prisma ausente.
- Aplicación/reversión/reaplicación de migraciones: completada correctamente en PostgreSQL temporal.
- Suite de endpoint real ampliada a 16 casos: falló antes de ejecutar los casos por Prisma Client ausente; 16 omitidos.
- Build: falló por tipos/cliente Prisma no generado. No se afirma que la aplicación compile.
- prisma generate: HTTP 403 al descargar checksum desde binaries.prisma.sh; se conserva verificación TLS/checksum.
- CI y suite global de tests: no ejecutados/verificados en esta entrega.

Antes de aprobar el PR se debe habilitar la descarga, regenerar Prisma Client,
aplicar las migraciones en una base exclusiva de pruebas y repetir build y la
suite real. La presencia de tests no significa que esos casos hayan pasado.
