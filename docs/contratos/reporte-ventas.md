# Contrato: GET /api/v1/reports/sales

## Descripción

Devuelve el total de ventas aprobadas para una sucursal o para el consolidado global, según el rol autenticado y el rango de fechas solicitado.

## Reglas

- Requiere autenticación con JWT válido.
- `from` y `to` son obligatorios y deben tener formato `YYYY-MM-DD`.
- El rango es inclusivo en días locales de la sucursal, convertido a UTC semiabierto por `Branch.timeZone`.
- El máximo permitido es 366 días inclusive; si se excede, responde `400 Bad Request`.
- Solo se suman pagos con `status = 'PAID'` y pedidos distintos de `CANCELED`.
- El total se devuelve como string con dos decimales: por ejemplo `"123.45"`.
- `paymentsCount` es la cantidad de pagos aprobados incluidos en el total.
- `branchId` es `null` para el consolidado global de `GENERAL_MANAGER`.

## Endpoint

```http
GET /api/v1/reports/sales?from=2026-01-15&to=2026-01-16&branchId=11111111-1111-4111-8111-111111111111
Authorization: Bearer <accessToken>
```

## Respuesta exitosa: 200 OK

```json
{
  "from": "2026-01-15",
  "to": "2026-01-16",
  "branchId": "11111111-1111-4111-8111-111111111111",
  "total": "123.45",
  "paymentsCount": 2
}
```

## Respuesta exitosa de consolidado: 200 OK

```json
{
  "from": "2026-01-15",
  "to": "2026-01-16",
  "branchId": null,
  "total": "320.99",
  "paymentsCount": 5
}
```

## Códigos de error

- `400 Bad Request`: formato inválido, from > to, rango > 366 días o branchId no UUID.
- `401 Unauthorized`: sin sesión o token inválido.
- `403 Forbidden`: rol sin acceso o branchId ajeno al BRANCH_ADMIN.
- `404 Not Found`: la sucursal indicada no existe para GENERAL_MANAGER.

## Notas de implementación

- Se reutiliza el patrón existente de `JwtAuthGuard` + `@CurrentUser()`.
- La autorización por rol/sucursal se verifica en el servicio, no en el controlador.
- El cálculo usa `Prisma.Decimal` y se serializa como string con dos decimales.
- La decisión explícita del equipo es excluir pedidos `CANCELED` aunque el pago esté `PAID`.
