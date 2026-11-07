# Contrato de reseñas

## Endpoint: POST /api/v1/reviews

### Descripción

Crea una reseña asociada a un pedido entregado del cliente autenticado. La API valida el `rating` con el DTO y exige que el pedido pertenezca al cliente, que el pedido exista y que esté en estado `DELIVERED`.

### Autenticación

- Requiere `Authorization: Bearer <accessToken>`.
- El cliente no puede reseñar pedidos ajenos.
- Solo `CLIENT` puede crear reseñas.

### Request

```json
{
  "orderId": "22222222-2222-4222-8222-222222222222",
  "rating": 5,
  "comment": "Excelente servicio"
}
```

### Validaciones

- `orderId`: UUID válido.
- `rating`: entero entre 1 y 5.
- `comment`: opcional, puede ser nulo o una cadena corta.

### Respuesta exitosa: 201 Created

```json
{
  "review": {
    "id": "11111111-1111-4111-8111-111111111111",
    "orderId": "22222222-2222-4222-8222-222222222222",
    "customerId": "33333333-3333-4333-8333-333333333333",
    "branchId": "44444444-4444-4444-8444-444444444444",
    "rating": 5,
    "comment": "Excelente servicio",
    "createdAt": "2026-11-06T22:00:00.000Z"
  },
  "branchRating": {
    "average": 4.5,
    "count": 3
  }
}
```

### Errores esperados

- `400 Bad Request`: rating inválido (`0`, `6`, `"abc"`) o UUID inválido.
- `401 Unauthorized`: sin sesión o token inválido.
- `403 Forbidden`: pedido ajeno o usuario no es cliente.
- `404 Not Found`: pedido inexistente o sucursal inexistente al consultar rating.
- `409 Conflict`: pedido no entregado (`PENDING`) o reseña duplicada.

## Endpoint: GET /api/v1/branches/:id/rating

### Descripción

Devuelve el promedio de reseñas de una sucursal y el número total de reseñas registradas.

### Request

- `GET /api/v1/branches/{branchId}/rating`
- Público, no requiere autenticación.

### Respuesta exitosa: 200 OK

```json
{ "average": 4.5, "count": 12 }
```

Si la sucursal no tiene reseñas:

```json
{ "average": null, "count": 0 }
```

### Errores esperados

- `400 Bad Request`: `branchId` no es UUID válido.
- `404 Not Found`: la sucursal no existe.

## Reglas de negocio verificadas

- Cada pedido admite como máximo una reseña.
- La unicidad se respeta por `order_id` en PostgreSQL.
- El promedio se calcula con la agregación real de la base y no se persiste como dato derivado.
- Las pruebas BE-11 validan la concurrencia: dos POST simultáneos producen solo una reseña creada.
