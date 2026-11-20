# Decisiones: reporte de platillos más vendidos

## Alcance

- Endpoint público interno: `GET /api/v1/reports/top-dishes`.
- El ranking se calcula por unidades, sumando `OrderItem.quantity`.
- La salida no incluye ingresos ni promedios; se limita a identificador, nombre y cantidad.
- Se mantiene el rango máximo de 366 días usado por el reporte de ventas.

## Elegibilidad

Un `OrderItem` entra al cálculo cuando:

1. Su pedido no tiene estado `CANCELED`.
2. La sucursal del pedido coincide con la sucursal consultada.
3. El pedido tiene al menos un pago con estado `PAID`.
4. Ese pago está dentro del rango UTC calculado desde `Branch.timeZone`.

No se excluyen por separado ítems con estado `CANCELED`, porque el requisito explícito indica excluir pedidos cancelados y no ítems cancelados. Si el comportamiento cambia posteriormente, debe incorporarse una decisión y prueba separada.

## Consolidación

- `BRANCH_ADMIN` solo consulta su sucursal.
- `GENERAL_MANAGER` consulta una sucursal si recibe `branchId`; omitirlo consolida todas las sucursales.
- Para cada sucursal se convierte el rango según su zona horaria antes de consultar.
- Los totales de todas las sucursales se agregan por `dishId` y se ordenan por cantidad descendente.

## Implementación

- DTO: validación y documentación Swagger de parámetros y salida.
- Servicio: autorización, rangos, selección de sucursales y consolidación.
- Repositorio: acceso a Prisma y filtrado por pedido/pago elegible.
- Se usa una consulta por sucursal y agregación en memoria para respetar el rango local de cada sucursal.

