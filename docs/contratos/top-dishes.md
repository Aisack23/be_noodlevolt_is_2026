# Contrato: GET /api/v1/reports/top-dishes

## Descripción

Devuelve los platillos más vendidos por unidades vendidas para una sucursal o para el consolidado global, según el rol autenticado y el rango de fechas solicitado.

## Parámetros

| Parámetro | Requerido | Validación | Descripción |
|---|---:|---|---|
| `from` | Sí | `YYYY-MM-DD` | Inicio inclusivo del rango local |
| `to` | Sí | `YYYY-MM-DD` | Fin inclusivo del rango local |
| `branchId` | No | UUID v4 | Sucursal consultada |
| `limit` | No | Entero de 1 a 100 | Máximo de platillos; default 10 |

## Endpoint

```http
GET /api/v1/reports/top-dishes?from=2026-01-15&to=2026-01-16&branchId=11111111-1111-4111-8111-111111111111&limit=10
Authorization: Bearer <accessToken>
```

## Respuesta exitosa: 200 OK

```json
{
  "from": "2026-01-15",
  "to": "2026-01-16",
  "branchId": "11111111-1111-4111-8111-111111111111",
  "dishes": [
    {
      "dishId": "22222222-2222-4222-8222-222222222222",
      "dishName": "Ramen tradicional",
      "quantity": 12
    }
  ]
}
```

Para el consolidado de `GENERAL_MANAGER`, `branchId` es `null`.

## Reglas

- Requiere JWT válido.
- Solo se permiten `BRANCH_ADMIN` y `GENERAL_MANAGER`.
- `BRANCH_ADMIN` solo puede consultar su propia sucursal.
- `GENERAL_MANAGER` puede consultar una sucursal o omitir `branchId` para consolidar todas.
- El rango máximo es de 366 días inclusivos.
- Se incluyen únicamente ítems cuyos pedidos no están `CANCELED`.
- El pedido debe tener al menos un pago `PAID` cuyo `createdAt` esté dentro del rango UTC derivado de la zona horaria de la sucursal.
- `quantity` representa la suma de unidades vendidas.
- Los resultados se ordenan por `quantity` descendente y luego por nombre de platillo.

## Códigos de error

- `400 Bad Request`: fechas inválidas, rango invertido, rango mayor a 366 días, zona horaria inválida o límite inválido.
- `401 Unauthorized`: sin sesión o token inválido.
- `403 Forbidden`: rol sin acceso o `branchId` ajeno al `BRANCH_ADMIN`.
- `404 Not Found`: la sucursal indicada no existe para `GENERAL_MANAGER`.

