# HU-03 extra: mesas, salones y recompensas

Todas las rutas usan el prefijo `/api/v1` y requieren un JWT válido. Los
controladores se documentan en Swagger. No existía controlador HTTP de mesas;
`DiningTablesModule` solo exportaba un repositorio. Esta ampliación añade un
controlador de consultas y un modelo de salones.

## Mesas y salones para comandas

| Método y ruta                        | Resultado 200                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------ |
| `GET /branches/:branchId/rooms`      | Salones con `id`, `branchId`, `name`, `isActive` y `tableCount`.               |
| `GET /branches/:branchId/tables`     | Mesas con `id`, `branchId`, `number`, `capacity`, `status`, `roomId` y `room`. |
| `GET /branches/:branchId/tables/:id` | Detalle de una mesa dentro de esa sucursal.                                    |

Las listas aceptan `page` (1..1000000, predeterminado 1) y `limit` (1..100,
predeterminado 20), y devuelven `{items, total, page, limit}`. Una lista vacía
responde 200 con `items: []` y `total: 0`. El total es independiente de la página.
Las consultas y su conteo comparten un snapshot `RepeatableRead`.

Las mesas aceptan `roomId` y `status` como filtros adicionales. Los estados son
`AVAILABLE`, `OCCUPIED`, `RESERVED`, `OUT_OF_SERVICE` y `NEEDS_CLEANING`. El estado
describe la situación física actual; la disponibilidad futura de reservaciones
sigue siendo responsabilidad de BE-04.

`room` contiene `{id, name, isActive}`. Las mesas sin salón conservan `roomId` y
`room` nulos. La lista incluye los estados actuales y los salones inactivos para
que el frontend pueda representarlos; no autoriza abrir una comanda sobre ellos.
`tableCount` cuenta todas las mesas del salón, en cualquier estado.

Permisos: `WAITER`, `COOK`, `CASHIER` y `BRANCH_ADMIN` consultan únicamente su
sucursal. `GENERAL_MANAGER` puede consultar cualquier sucursal activa. `CLIENT`
e `INVENTORY_MANAGER` reciben 403. Una sucursal inactiva/inexistente o una mesa o
salón que no pertenezca a la sucursal solicitada devuelve 404. UUID, filtros o
paginación inválidos y parámetros desconocidos devuelven 400; sin sesión, 401.

Los salones se ordenan por nombre e ID; las mesas por número como texto e ID.
La migración crea «Salón principal» por sucursal existente y asigna sus mesas sin
alterar número, capacidad ni estado. Una FK compuesta impide asociar una mesa a
un salón de otra sucursal. El seed base crea el salón para las sucursales demo y
solo asigna las mesas que aún no tengan salón.

## Catálogo de puntos

`GET /loyalty/rewards`, solo `CLIENT`, devuelve un arreglo de beneficios activos
configurados como recompensas, ordenado por `pointsCost` e ID. Cada entrada
incluye `id`, `name`, `description`, `pointsCost`, `rewardType`, `productName` y
`discountPercent`.

| Recompensa inicial | Puntos | Tipo             | Beneficio                               |
| ------------------ | -----: | ---------------- | --------------------------------------- |
| Salsa extra        |     20 | PRODUCT          | Una porción.                            |
| Wantanes           |     60 | PRODUCT          | Una orden.                              |
| 10% de descuento   |    100 | PERCENT_DISCOUNT | 10% del subtotal del pedido.            |
| Rollitos primavera |    150 | PRODUCT          | Una orden, la de mayor coste en puntos. |

Los valores iniciales se guardan en `benefits`; no se calculan a partir de un
precio enviado por el cliente. Los beneficios heredados sin `rewardType`
conservan sus datos y no se ofrecen como recompensas incompletas en esta API.
El historial puede incluir canjes heredados con tipo y pedido nulos.

## Canjear en el pedido

```http
POST /api/v1/loyalty/redemptions
Authorization: Bearer <accessToken>
Content-Type: application/json
```

```json
{
  "benefitId": "73000000-0000-4000-8000-000000000003",
  "orderId": "20000000-0000-4000-8000-000000000001",
  "operationKey": "30000000-0000-4000-8000-000000000001"
}
```

El cliente debe conservar `operationKey` al reintentar exactamente la misma
operación. No se admiten `customerId`, coste, porcentaje, precio ni campos extra.
El propietario se obtiene de la sesión.

Se requiere un pedido propio `TAKEOUT`, `PENDING`, de una sucursal activa y
abierta, con importe positivo, sin pago aprobado y sin otro canje. Se admite una
recompensa por pedido. El flujo se integra con los pedidos para llevar y el pago
simulado existentes; no crea un nuevo flujo de caja para comandas de salón.

Para productos, se valida el platillo de esa sucursal, su categoría activa y los
indicadores de disponibilidad del catálogo. Se añade una línea independiente de
una unidad, `unitPrice: 0` y nota «Canje de puntos». El precio normal del platillo
no cambia. Cocina ve esa línea mediante su endpoint existente.

Para descuentos, el servidor suma las líneas históricas, calcula el porcentaje
con `Prisma.Decimal` y redondea a dos decimales con `ROUND_HALF_UP`. Un subtotal
de `17.00` produce descuento `1.70` y total `15.30`. El cobro guarda el subtotal
bruto y el descuento; `totalPaid`, la respuesta del pago y el comprobante usan
el importe neto. La acreditación de puntos sigue usando el importe realmente
pagado. La respuesta de creación/reintento de pedidos también expone `discount`
y `loyaltyRedemptionId`.

El saldo se descuenta con una actualización condicional `points >= pointsCost`.
La operación registra un movimiento `REDEEM` negativo y un canje `USED`, guarda
el nombre, coste y definición históricos y enlaza el pedido. Todo se confirma en
una sola transacción. Si falla cualquiera de esas escrituras se revierten las
demás. El bloqueo del pedido coordina canjes con cocina y pagos; el bloqueo de
la clave de operación permite reintentos coincidentes sin duplicar resultados.

| Estado HTTP | Resultado                                                                                                                   |
| ----------- | --------------------------------------------------------------------------------------------------------------------------- |
| 201         | Canje creado y aplicado.                                                                                                    |
| 200         | Reintento de la misma operación; conserva el mismo ID y no vuelve a descontar.                                              |
| 400         | UUID/cuerpo inválido o campos no permitidos.                                                                                |
| 401         | Sesión ausente o inválida.                                                                                                  |
| 403         | Usuario con rol distinto de CLIENT.                                                                                         |
| 404         | Pedido inexistente/ajeno o recompensa inexistente/inactiva/no configurada.                                                  |
| 409         | Saldo insuficiente, producto no disponible, sucursal cerrada/inactiva, pedido no elegible o clave usada con otro contenido. |

La respuesta incluye `id`, `benefitId`, `code`, `pointsCost`, `rewardName`,
`rewardType`, `productName`, `discountPercent`, `status`, `createdAt`, `usedAt` y
`order: {id, total, discount}`. Los importes son cadenas con dos decimales.
`code` es la referencia del canje, no un cupón transferible pendiente de aplicar.
Una respuesta `USED` significa aplicado al pedido; la entrega física del regalo
sigue el estado normal de cocina.

`GET /loyalty/redemptions/me` lista únicamente los canjes del usuario autenticado
con la misma paginación anterior y orden descendente por fecha e ID. Sin canjes,
devuelve 200 con una colección vacía. Tras canjear, FE debe refrescar el saldo
con `GET /loyalty/me` y actualizar el pedido con el resultado recibido.

El canje se aplica de inmediato. Si el pago es rechazado, el cliente puede
reintentar el pago conservando la recompensa aplicada. Esta ampliación no añade
cancelación ni reembolso de canjes, administración HTTP de recompensas o CRUD de
mesas/salones.

## Preparación de datos

Aplicar las dos migraciones nuevas, regenerar Prisma Client y preparar los
productos en las sucursales activas:

```bash
npm run prisma:deploy
npm run prisma:generate
npm run db:seed:rewards
```

El seed de recompensas crea los productos faltantes en «Entradas»: salsa extra
`0.75`, wantanes `3.00` y rollitos `4.50`. Si ya existen, conserva precio,
disponibilidad y demás personalizaciones. El seed general también lo ejecuta.
No crea usuarios ni añade puntos de prueba a clientes.

El catálogo es global y la disponibilidad del producto se comprueba por sucursal
al canjear. Si no existe o no está disponible, se responde 409 sin gastar puntos.
Los scripts `down.sql` rechazan eliminar salones personalizados, recompensas
modificadas o canjes registrados; no deben forzarse descartando datos.
