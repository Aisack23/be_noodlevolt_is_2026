# Pedido para llevar — BE-2.2.1

`POST /api/v1/pedidos-llevar` requiere sesión y un UUID en `Idempotency-Key`. Recibe sucursalId, modalidadPago (EN_LINEA o EN_CAJA) y lineas con platilloId, cantidad de 1 a 20 y precioEsperado como string decimal. No se aplica todavía una restricción por rol; queda pendiente BE-A.2.1.

## Decisión del equipo sobre errores

La historia menciona 409 para cambios de disponibilidad y también 422 para platillos no disponibles. El equipo reserva 409 para precios cambiados, con preciosActuales, y usa 422 para cualquier platillo agotado, deshabilitado, de otra sucursal, inexistente, de categoría inactiva o sin insumos, con la lista de platillos afectados. Así cada causa tiene una respuesta consistente. Ninguno de esos errores crea un pedido. Una sucursal inexistente o inactiva responde 400.

## Idempotencia y transacción

La clave se persiste explícitamente en operation_id. Una repetición del mismo cliente, sucursal, modalidad y líneas devuelve 200 con el pedido existente, aunque después cambien los precios del catálogo. Se comparan cantidades y precios contra el snapshot de las líneas; el orden de las líneas y diferencias de representación decimal no cambian el contenido. Otra combinación o un cliente distinto recibe 422 sin revelar el pedido ajeno. La clave es globalmente única.

El repositorio inserta pedido y líneas e invoca InventoryConsumer dentro de una misma transacción. Ante P2002 relee la clave y el servicio vuelve a comprobar el contenido. Los precios unitarios proceden de la base; subtotales y total se calculan con Decimal, sin convertir importes a Number. La hora de retiro es la hora del servidor más veinte minutos y se devuelve como ISO con el offset de Branch.timeZone.

EN_CAJA crea TAKEOUT en PENDING; EN_LINEA lo crea en PENDING_PAYMENT. PaymentMode se guarda desde la creación. DB-6.2.1 agregará los restantes campos de pago sin redefinirlo.

## Integración con E5

## Confirmación frente a cambios concurrentes

Al iniciar la transacción, el repositorio bloquea únicamente los IDs de los platillos del carrito con SELECT id ... ORDER BY id FOR SHARE, usando $queryRaw y Prisma.sql parametrizado. Prisma no expone un bloqueo de filas equivalente en findMany; este SQL permite mantener estable precio, estado y sucursal hasta confirmar. Solo se usa SQL para adquirir los bloqueos: la lectura posterior y las escrituras son consultas tipadas de Prisma en la misma transacción. El servicio valida los datos mediante un callback sin conocer Prisma. Si una actualización obtuvo primero el bloqueo, se espera su commit y se revalida el valor nuevo (409 si difiere); si la confirmación obtuvo primero el bloqueo compartido, la actualización espera y el pedido conserva el precio vigente durante esa confirmación. Un e2e mantiene una actualización de precio abierta y verifica que la confirmación responde 409 tras liberarla.

## Integración con E5

Se reutiliza IngredientAvailabilityChecker para una consulta por lote. Su contrato actual evalúa una porción de cada platillo, no las cantidades agregadas del carrito. La comprobación definitiva de cantidades e insumos compartidos corresponde a BE-5.1.2 dentro de la transacción. Si el verificador falla, se rechaza el carrito con 422 y se registra warn.

InventoryConsumer recibe pedidoId y el cliente transaccional Prisma del repositorio. Su adaptador temporal NoopInventoryConsumer no descuenta stock y está marcado TODO(E5) BE-5.1.2. InventoryModule deberá registrar y exportar el provider real; TakeoutOrdersModule importará ese módulo y enlazará INVENTORY_CONSUMER mediante useExisting. El provider debe usar exclusivamente la transacción recibida, bloquear insumos en orden de ID y lanzar TakeoutUnavailableError con los platillos afectados si el stock no alcanza. Un fallo revierte pedido, líneas y movimientos realizados en esa transacción.

## Aritmética decimal

Se agrega `decimal.js` como dependencia directa (`^10.6.0`) para comparar precios y calcular subtotales y totales sin conversiones a `Number`. El servicio y los tipos del dominio usan esta biblioteca sin importar Prisma; el repositorio convierte los importes leídos de Prisma a Decimal mediante su representación textual.

La alternativa sin dependencia nueva era reutilizar `Prisma.Decimal`, ya disponible en el cliente generado, mediante una utilidad de dinero aislada fuera del servicio. También ofrece aritmética decimal exacta, pero vincula esa utilidad al cliente de Prisma. Se eligió la dependencia directa para mantener explícita la biblioteca monetaria del dominio y permitir usarla sin generar ni importar el cliente de persistencia. No se agrega una biblioteca para redondear floats: los importes permanecen decimales desde su lectura hasta la respuesta.

## Verificación

Con DATABASE_URL de PostgreSQL de Docker y JWT_SECRET de pruebas, ejecutar migraciones y luego npm run lint, npm run build, npm test, npm run test:db, npm run test:e2e y npm run test:migrations. Los e2e comprueban autenticación, validación, repetición y concurrencia de claves, precios, indisponibilidad y rollback del consumo.
