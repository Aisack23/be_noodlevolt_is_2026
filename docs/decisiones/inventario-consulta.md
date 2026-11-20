# Consulta de inventario — BE-05

## Endpoint

`GET /api/v1/inventory` lista las existencias de insumos con su señal de stock bajo. La documentación está en Swagger (`/api/docs`).

| Usuario                                                 | Respuesta                                                |
| ------------------------------------------------------- | -------------------------------------------------------- |
| Sin token o con token inválido                          | 401                                                      |
| CLIENTE, MESERO, COCINA, CAJERO o ENCARGADO_INVENTARIO  | 403                                                      |
| GERENTE con sucursal activa                             | 200 con las existencias de su sucursal; `[]` si no tiene |
| GERENTE con sucursal inactiva                           | 404 «La sucursal no existe.»                             |
| GERENTE_GENERAL                                         | 200 con las existencias de todas las sucursales activas  |
| Cualquier usuario con `branchId` distinto a su sucursal | 403 «No tiene permiso para consultar este inventario.»   |

```json
[
  {
    "id": "40000000-0000-4000-8000-000000000001",
    "branchId": "10000000-0000-4000-8000-000000000001",
    "branchName": "NoodleVolt Centro",
    "name": "Fideos de ramen",
    "unit": "kg",
    "currentStock": 3,
    "minimumStock": 5,
    "isLowStock": true,
    "updatedAt": "2026-11-05T18:00:00.000Z"
  }
]
```

`id` es `branch_ingredients.id`. Las cantidades se devuelven como números: `NUMERIC(14,3)` tiene 14 dígitos significativos y cabe sin pérdida en un `number`. Excluye filas inactivas de `branch_ingredients` y de `ingredients`. Ordena por sucursal, nombre del insumo e id.

## Decisiones

- **Permisos.** La Parte 2.7 de V_FINAL permite GERENTE y GERENTE_GENERAL, así que ENCARGADO_INVENTARIO queda excluido.
- **Origen de la sucursal.** El rol y la sucursal salen de `@CurrentUser()`, que `JwtAuthGuard` relee de la base en cada petición. Si un usuario cambia de sucursal, el cambio aplica sin esperar a que expire el token.
- **`?branchId=`.** La ruta no lleva sucursal, así que sin este parámetro un gerente no tendría forma de pedir otra y el criterio 3 de HU-05 no tendría rechazo que comprobar. Solo se compara con la sucursal del usuario: nunca llega al repositorio. Por eso un valor ajeno, inexistente, repetido o con formato inválido responde 403, y nunca 400 o 404, sin revelar si esa sucursal existe.
- **GERENTE_GENERAL.** V_FINAL dice «acceso autorizado» sin definirlo. `users_role_branch_check` obliga a que su `branch_id` sea NULL y la sucursal no se elige por query, de modo que ve todas las sucursales activas. Cada fila trae `branchId` y `branchName` para distinguirlas. Todo `branchId` que envíe responde 403. La sección 2.2 reserva este rol para reportes, pero la 2.7 y BE-05 son específicas de esta operación.
- **Stock bajo.** `isLowStock` no se guarda: se calcula en el servicio como `currentStock <= minimumStock`, comparando `Decimal`.
- **404.** Solo aplica a un gerente cuya sucursal está inactiva: el CHECK y el FK de `users` garantizan que tenga una sucursal real.
- **Validación de rol.** Se hace en el servicio, igual que BE-11, porque el guard de roles de BE-A.2.1 todavía no está en `develop`.
- **Ubicación.** El código vive en `src/inventory/stock/` y no cambia los repositorios de Inventario: `findActiveByBranch` no devuelve nombre ni unidad, y agregarlos alteraría su tipo de retorno. En `inventory.module.ts` solo se registran el controlador, el repositorio y el servicio nuevos.

## Pruebas

`test/db-inventory-stock.e2e-spec.ts` no usa el seed: crea con nombres únicos sus sucursales, usuarios, insumos y existencias, y los elimina al terminar. Cambiar las existencias de Centro o Santa Tecla no afecta sus aserciones. Como la base se comparte con otras suites, en el GERENTE_GENERAL solo exige sus sucursales de prueba, no la lista completa.
