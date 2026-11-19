# 1. Guía de uso

Esta guía describe quién puede hacer qué en NoodleVolt y cómo se recorren los flujos principales. Las capturas de pantalla se agregarán después; los marcadores indican dónde irán.

## 1.1 Roles

El acceso se define por el rol del usuario y, para el personal, por la sucursal a la que pertenece. El personal (salvo el gerente general) solo opera sobre su sucursal.

| Rol | Quién lo usa | Sucursal |
|---|---|---|
| CLIENTE | Cliente que hace pedidos, reservas y consulta puntos | No aplica |
| MESERO | Atiende salón: registra pedidos de mesa y entrega pedidos listos | Sí |
| COCINA | Prepara comandas | Sí |
| GERENTE | Administra su sucursal: abre o cierra recepción de pedidos, consulta inventario y ventas | Sí |
| GERENTE_GENERAL | Consulta transversal de inventario y ventas de varias sucursales | No |

Las cuentas de personal se crean con seed; el registro público solo crea cuentas de CLIENTE.

## 1.2 Permisos por operación

Fuente: sección 2.7 del documento V_FINAL. Los roles de la tabla son los de la interfaz; en la API se usan sus equivalentes en inglés (ver [02 · Arquitectura](02-arquitectura.md#25-decisiones-técnicas) y [03 · Modelo de datos](03-modelo-de-datos.md#32-equivalencias-de-roles-y-estados)).

| Operación | Rol permitido | Restricción de datos |
|---|---|---|
| Consultar menú | Público, sin sesión | Una sucursal elegida |
| Consultar si la sucursal está abierta | Público, sin sesión | Una sucursal |
| Crear pedido para llevar y pagarlo | CLIENTE | Pedido propio, en sucursal abierta |
| Registrar pedido de salón | MESERO | Su sucursal |
| Ver y avanzar comandas | COCINA | Solo su sucursal |
| Marcar pedido como ENTREGADO | MESERO | Pedido LISTO de su sucursal |
| Crear reservación | CLIENTE | Propia reservación; mesa disponible |
| Consultar inventario | GERENTE, GERENTE_GENERAL | Gerente: su sucursal. Gerente general: sucursales autorizadas |
| Consultar puntos, reseñar y ver notificaciones | CLIENTE | Solo datos del propio usuario |
| Consultar ventas | GERENTE, GERENTE_GENERAL | Gerente: su sucursal. Gerente general: cualquiera o todas |
| Abrir o cerrar la sucursal | GERENTE | Solo la sucursal asignada |

Sin sesión válida la API responde 401; con sesión pero sin permiso, 403; con recurso inexistente, 404; con conflicto de negocio, 409; y con datos inválidos, 400.

## 1.3 Flujo: consultar el menú

1. Abrir la página pública del menú y elegir la sucursal.
2. Revisar categorías, platillos, precios y disponibilidad. Solo aparecen platillos activos y disponibles.
3. Si el servidor no responde, la página muestra un mensaje de error y no datos de respaldo.

![Menú público por sucursal](img/HU-01-menu-publico.png)

## 1.4 Flujo: pedido para llevar

Rol: CLIENTE. Requisito: la sucursal debe estar abierta.

1. Iniciar sesión en `/login` o crear cuenta en `/registro`.
2. Agregar platillos y cantidades al carrito en `/menu`.
3. Confirmar el pedido en `/pedidos/llevar`. El total se calcula en el servidor con los precios vigentes y se crea un pedido en estado PENDIENTE.
4. Si el carrito está vacío, no se crea ningún pedido y se muestra un aviso.
5. Si un platillo dejó de estar disponible, el servidor rechaza el pedido e indica cuál fue.
6. Pagar en `/pedidos/[id]/pago` con una tarjeta de prueba: la terminada en **4242** aprueba y la terminada en **0002** rechaza. El pago tarda unos dos segundos.
7. Un pago aprobado genera un comprobante simple y acredita puntos una sola vez.

![Confirmación de pedido para llevar](img/HU-02-pedido-llevar.png)
![Pago con tarjeta de prueba](img/HU-06-pago-simulado.png)

## 1.5 Flujo: pedido de salón, cocina y entrega

Roles: MESERO, COCINA.

1. El mesero registra el pedido de la mesa desde `/mesero/comanda`.
2. La cocina ve las comandas pendientes y en preparación de su sucursal, en orden de creación, en `/cocina/tablero`.
3. La cocina avanza el pedido: PENDIENTE → EN_PREPARACION → LISTO. Saltar una etapa devuelve 409.
4. Al marcar un pedido como LISTO se crea un aviso interno para el cliente.
5. El mesero ve los pedidos listos en `/mesero/listos` y confirma la entrega (LISTO → ENTREGADO).

![Tablero de cocina](img/HU-03-tablero-cocina.png)
![Pedidos listos para entrega](img/HU-03-listos-mesero.png)

## 1.6 Flujo: aviso de pedido listo

Rol: CLIENTE.

1. Cuando su pedido cambia a LISTO, el cliente recibe un aviso en `/notificaciones`.
2. Si el evento se procesa de nuevo, no se crea un segundo aviso.
3. Si no hay avisos, el buzón muestra un estado vacío.

![Buzón de notificaciones](img/HU-09-notificaciones.png)

## 1.7 Flujo: reservar una mesa

Rol: CLIENTE.

1. Elegir fecha, hora y número de personas en `/reservar`.
2. El sistema muestra las mesas libres para un intervalo de 90 minutos.
3. Confirmar la reservación. Si la mesa ya tiene una reservación solapada, el servidor responde 409 y no guarda nada.
4. El gerente consulta las reservaciones de su sucursal en `/gerente/reservaciones`.

![Reservar mesa](img/HU-04-reservar-mesa.png)

## 1.8 Flujo: inventario con bajo stock

Roles: GERENTE, GERENTE_GENERAL.

1. Abrir `/gerente/inventario`.
2. Revisar existencias y mínimo de cada insumo. Los insumos en o bajo su mínimo aparecen señalados como stock bajo.
3. Se muestra la fecha de última actualización. Los pedidos no descuentan insumos automáticamente en el MVP.

![Inventario con alertas](img/HU-05-inventario-bajo-stock.png)

## 1.9 Flujo: ventas y platillos más vendidos

Roles: GERENTE (su sucursal), GERENTE_GENERAL (varias sucursales).

1. Abrir `/gerente/reportes/ventas` y elegir el rango de fechas.
2. El reporte suma solo pagos aprobados. Los pagos rechazados y los pedidos cancelados no se incluyen.
3. Si la fecha inicial es posterior a la final, el servidor responde 400.
4. En `/gerente/reportes/top-dishes` se consultan los platillos más vendidos por cantidad.

![Reporte de ventas](img/HU-10-reporte-ventas.png)

## 1.10 Flujo: abrir o cerrar la sucursal

Rol: GERENTE.

1. Abrir la pantalla de estado de la sucursal (`/admin/sucursales` [verificar ruta y permisos en la interfaz]).
2. Cambiar el estado entre ABIERTA y CERRADA y confirmar.
3. Con la sucursal cerrada, el cliente sigue viendo el menú, pero el servidor rechaza nuevos pedidos.
4. Un gerente de otra sucursal recibe 403 y el estado no cambia.

![Estado operativo de la sucursal](img/HU-11-estado-sucursal.png)

## 1.11 Flujo: puntos de lealtad y reseñas

Roles: CLIENTE.

1. Consultar el saldo en `/perfil/puntos`. Se acredita un punto por cada dólar completo de un pago aprobado.
2. Una vez entregado un pedido propio, calificarlo de 1 a 5 en `/pedidos/[id]/resena`.
3. Un pedido PENDIENTE no se puede reseñar; un pedido que ya tiene reseña devuelve 409.
4. Las reseñas se consultan como promedio por sucursal; el cliente solo ve sus propios datos.

![Saldo de puntos](img/HU-07-puntos.png)
![Reseña de pedido entregado](img/HU-08-resena.png)
