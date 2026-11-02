# Contrato del menú público — BE-1.2.1

## Endpoint

`GET /api/v1/sucursales/:sucursalId/menu` es público mediante `@Public()`. El identificador se valida con ParseUUIDPipe, conforme al UUID de Branch.id.

- 200: sucursal existente, incluso si no tiene platillos visibles (`categorias: []`).
- 400: identificador con formato inválido; mensaje «El identificador de sucursal no es válido.», generado por exceptionFactory de ParseUUIDPipe.
- 404: UUID válido de sucursal inexistente; mensaje «La sucursal no existe.».

```json
{
  "sucursal": {
    "id": "10000000-0000-4000-8000-000000000001",
    "nombre": "NoodleVolt Centro"
  },
  "categorias": [
    {
      "id": "20000000-0000-4000-8000-000000000001",
      "nombre": "Platos fuertes",
      "platillos": [
        {
          "id": "30000000-0000-4000-8000-000000000001",
          "nombre": "Ramen de pollo",
          "descripcion": null,
          "precio": "8.50",
          "disponible": true
        }
      ]
    }
  ]
}
```

Los DTO mapean los nombres del modelo en inglés a claves JSON en español. Los precios mantienen Decimal hasta su conversión con `toFixed(2)`, sin pasar por Number. Las categorías sin platillos visibles se omiten; categorías y platillos se ordenan alfabéticamente en español, con ID como desempate.

## Lectura y disponibilidad

El repositorio usa consultas tipadas de Prisma: `Branch.findUnique` y `Dish.findMany`, filtrando branchId y status distinto de DISABLED, con include de categoría. No usa SQL crudo ni consultas dentro de bucles. Prisma puede resolver el include mediante una consulta agrupada para las categorías; no se realiza una lectura por platillo. La sucursal se consulta por separado para distinguir inexistente de menú vacío.

DISABLED se excluye. SOLD_OUT permanece visible con disponible=false. AVAILABLE es disponible solo si el verificador de insumos devuelve su ID. Cada solicitud consulta el estado y precio actuales; esta ruta no reserva ni descuenta inventario y no cambia estados persistidos. Al confirmar un pedido deben revalidarse insumos y precios.

## Puerto de E5

```typescript
interface IngredientAvailabilityChecker {
  findSufficientDishIds(
    branchId: string,
    dishIds: readonly string[],
  ): Promise<ReadonlySet<string>>;
}
```

Se invoca una sola vez con los IDs visibles de esa sucursal, también si la lista está vacía. El resultado identifica cuáles pueden prepararse con una porción cada uno, evaluados individualmente. No representa un pedido que consuma todos los platillos simultáneamente: agregar los requerimientos de todo el menú produciría disponibilidades incorrectas. Los IDs ausentes son insuficientes; un fallo del verificador se propaga, no confirma disponibilidad.

El token `INGREDIENT_AVAILABILITY_CHECKER` está en `src/catalog/menu/ports`. Su provider actual, `AlwaysSufficientIngredientChecker`, es temporal, devuelve todos los IDs y está marcado `// TODO(E5) BE-5.1.1`. Hasta reemplazarlo, el menú no detecta faltantes reales de inventario. Diego puede cambiar únicamente el `useClass` del provider en CatalogModule por su implementación de BE-5.1.1; el contrato, servicio y controlador se mantienen.

## Registro y alcance

Se reutilizan CatalogModule y los alias existentes. El único archivo previo modificado es `src/catalog/catalog.module.ts`, para registrar el controlador, servicio, repositorio y provider del puerto. No se cambian migraciones, schema, repositorios anteriores, autenticación ni configuración de tests.

## Patrón utilizado

Se usa un puerto/adaptador para aislar la dependencia de E5: el servicio de menú necesita conocer disponibilidad, sin depender de la implementación de recetas e inventario. El token de inyección permite reemplazar el adaptador temporal por el verificador real o por un doble en pruebas sin cambiar el servicio.

- `ports/` define el contrato IngredientAvailabilityChecker y su token de inyección.
- `adapters/` contiene la implementación temporal del contrato; es el punto de conexión con E5.
- `types/` define los tipos internos de lectura, precio y menú, independientes de los DTO HTTP y de las clases de Prisma.

## Pruebas

Los unitarios del servicio usan dobles del repositorio y del verificador. `test/db-menu.e2e-spec.ts` usa AppModule, su guard global y PostgreSQL reales; se incluye automáticamente en test:db y test:e2e. Sus fixtures tienen UUID propios, se confirman para ser visibles desde la conexión del servidor y se eliminan al terminar, sin tocar datos ajenos. La clave JWT de pruebas se genera en memoria si no existe una configurada.

Con DATABASE_URL del PostgreSQL de Docker y las migraciones aplicadas:

```bash
npm run lint
npm run build
npm test
npm run test:db
npm run test:e2e
```

La suite e2e heredada también necesita JWT_SECRET de al menos 32 caracteres en su entorno.
