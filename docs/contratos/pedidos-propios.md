# Contrato: GET /api/v1/orders/me

## Descripción

Devuelve los pedidos del cliente autenticado, ordenados por `createdAt` descendente y limitados a 50 resultados. Si se pasa `status`, filtra por ese estado. La operación siempre se limita al `customerId` del JWT y nunca acepta un `userId` del cliente.

## Reglas

- Requiere autenticación con JWT válido.
- Solo `CLIENT` puede usar este endpoint.
- `status` es opcional y debe pertenecer a `OrderStatus`.
- Si `status` es inválido, responde `400 Bad Request`.
- Si no hay pedidos, responde `200 OK` con `[]`.
- Los totales se serializan como string con dos decimales: por ejemplo `"125.50"`.
- La consulta usa una sola búsqueda a Prisma con `include`/`select` para `branch.name` y `review`.

## Endpoint

```http
GET /api/v1/orders/me?status=PENDING
Authorization: Bearer <accessToken>
```

## Respuesta exitosa: 200 OK

```json
[
  {
    "id": "11111111-1111-4111-8111-111111111111",
    "orderNumber": "ORD-2026-001",
    "status": "DELIVERED",
    "total": "125.50",
    "createdAt": "2026-11-06T22:00:00.000Z",
    "branchId": "44444444-4444-4444-8444-444444444444",
    "branchName": "Sucursal Centro",
    "review": {
      "id": "22222222-2222-4222-8222-222222222222",
      "rating": 5
    }
  },
  {
    "id": "33333333-3333-4333-8333-333333333333",
    "orderNumber": "ORD-2026-002",
    "status": "PENDING",
    "total": "89.00",
    "createdAt": "2026-11-05T20:00:00.000Z",
    "branchId": "44444444-4444-4444-8444-444444444444",
    "branchName": "Sucursal Centro",
    "review": null
  }
]
```

## Códigos de error

- `400 Bad Request`: `status` no pertenece al enum `OrderStatus`.
- `401 Unauthorized`: sin sesión o token inválido.
- `403 Forbidden`: el usuario autenticado no tiene rol `CLIENT`.

## Notas de implementación

- Se reutiliza `OrderRepository` existente.
- El filtrado se aplica con `customerId = user.id` del JWT.
- El ordenamiento es `createdAt: 'desc'` y el límite es `take: 50`.
- La respuesta no expone datos de usuario ni de cliente del pedido; solo la sucursal y la reseña asociada.
