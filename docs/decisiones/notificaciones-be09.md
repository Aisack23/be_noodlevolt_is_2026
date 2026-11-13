# HU-09 / BE-09: aviso interno de pedido listo

## API del cliente

GET /api/v1/notifications/me requiere JWT válido y rol CLIENT. El propietario
proviene del usuario verificado por el guard; no se aceptan userId, branchId ni
otros filtros. Paginación: page=1 por defecto (1..1000000), limit=20 (1..100).
Devuelve 200 con items, total, unreadCount, page y limit. Orden: createdAt descendente e ID
descendente. Un buzón vacío devuelve items=[], total=0 y unreadCount=0, no 404. FE-09 puede
mostrar «No tienes avisos todavía». Una página posterior sin filas no implica
que total sea cero; total representa todo el buzón del propietario.

Cada aviso expone id, type, title, message, orderId, isRead y createdAt ISO UTC.
PEDIDO_LISTO siempre tiene orderId; otros tipos heredados pueden tenerlo nulo.
No se exponen userId, eventKey ni auditoría. El GET no modifica isRead. Una sesión
inválida responde 401, personal autenticado 403 y paginación o query extra 400.
La consulta se ejecuta con snapshot RepeatableRead para alinear items, total y unreadCount.

## Lectura de avisos

PATCH /api/v1/notifications/:id/read requiere JWT válido y rol CLIENT. Acepta
una petición sin cuerpo o con {}. Devuelve 200 con el aviso actualizado y
isRead=true. La actualización filtra por ID y usuario autenticado en la base;
no acepta un destinatario enviado por el cliente. Un UUID inválido o cuerpo no
vacío responde 400, sesión inválida 401 y personal autenticado 403. Un ID ajeno
o inexistente recibe el mismo 404 para no revelar si existe.

La operación es idempotente: repetirla, incluso concurrentemente, devuelve 200
y conserva isRead=true. No elimina el aviso ni cambia su contenido. Un reintento
del evento READY tampoco restablece el estado de lectura.

unreadCount representa todos los avisos propios sin leer, independientemente de
la página. total sigue contando todos los avisos propios, leídos y no leídos.
FE-09 debe usar unreadCount para el contador y refrescar el buzón tras confirmar
el PATCH; no debe descontar una unidad por cada reintento. El GET sigue sin
modificar isRead.

## Generación interna

Se agrega NotificationsModule, importado por AccountsOrdersModule. No importa
CustomerFeaturesModule ni genera ciclos con reseñas. El módulo utiliza un
repositorio propio de lecturas públicas y creación idempotente; conserva el
repositorio genérico anterior sin cambios.

NotificationsService.notifyOrderReady(orderId, tx) es interno y exige el cliente
transaccional del llamador. Lee el propietario y la sucursal persistidos, valida
READY y crea PEDIDO_LISTO:<orderId>:<recipientId>. El mensaje incluye referencia
al pedido y nombre de sucursal. Los pedidos sin propietario no producen avisos;
no se inventa destinatario ni se interrumpe cocina por esa ausencia.

OrderRepository.transitionKitchenStatus invoca el emisor después de actualizar
estado, líneas e historial, dentro de la misma transacción. Si el aviso falla,
ninguno de esos cambios se confirma. Un reintento READY sobre un pedido ya READY
vuelve a intentar el aviso sin duplicar historial. Esto también permite completar
el aviso faltante de un pedido READY anterior al despliegue al reintentar READY.

Se reutiliza DB-09: clave única (userId,eventKey), CHECK de PEDIDO_LISTO y FK al
pedido. createMany con skipDuplicates aplica la unicidad PostgreSQL, luego se
lee el aviso existente/creado en la misma transacción. No se sobrescribe su
contenido ni estado de lectura durante un reintento, incluso concurrente.

No se expone POST público de notificaciones: la interfaz interna cubre el evento
y evita que un cliente fabrique avisos para otro. No se añaden correo, WebSocket,
notificaciones push ni pantalla frontend. Frontend debe consultar al abrir el
buzón o repetir la consulta según su estrategia de actualización.

## Validación inicial de BE-09

- Tipos y build aprobados.
- 214 pruebas unitarias globales aprobadas (17 suites), incluidas 18 nuevas BE-09.
- Ocho E2E nuevos aprobados con AppModule, Prisma y PostgreSQL reales.
- Cubren READY, aislamiento entre dos clientes, vacío, transición inválida,
  reintentos concurrentes de cocina, reintentos internos, permisos, paginación y
  rollback atómico forzando un fallo de INSERT mediante un trigger de prueba.
- E2E global: 290 aprobadas y 2 fallidas, 23 suites (22 aprobadas, 1 fallida).
  Los fallos corresponden a pickupAt y AT_COUNTER de pedidos, no modificados.
- Lint global exit 0 con ocho advertencias previas en pedidos/menú/tests; no se
  presenta como limpio. Lint de los archivos nuevos sin incidencias.
- Se corrigen dos bloqueos previos de los tests de develop: faltaba cerrar el
  describe de reservaciones y el rol del fixture de cocina se infería como string
  en lugar de la constante COOK. No se modificaron sus reglas de negocio.
- No se verificó CI ni frontend desde este repositorio.

No se añadieron migraciones: se requiere aplicar las de DB-09 ya incluidas en
develop y regenerar Prisma Client antes de iniciar.

La validación de la ampliación de lectura se registra en
[BE-09-extra-endpoints](../pr/BE-09-extra-endpoints.md).
