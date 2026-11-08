# feat(BE-2.2.1): completar y unificar pedidos para llevar

## Qué cambia

- Se actualiza feat/be-2.2.1-pedido-llevar con develop, conservando el historial del trabajo inicial.
- Se consolida el flujo en POST /api/v1/orders y se retira el módulo duplicado de la rama antigua.
- Se rescatan modalidades ONLINE/AT_COUNTER, precio esperado opcional y retiro estimado en veinte minutos.
- Se corrige la persistencia de paymentMode, obligatoria para TAKEOUT en PostgreSQL.
- Todo pedido comienza PENDING; crearlo no implica pago aprobado ni bloquea su ingreso a cocina.
- Se mantiene el cálculo decimal del servidor, precio histórico por línea y total persistido.
- Se reutilizan las validaciones de rol CLIENT, titularidad y sucursal abierta en la transacción.
- Se excluyen platillos ajenos, eliminados, no disponibles, agotados y categorías inactivas.
- Se normalizan modalidades, UUID y precios esperados para reintentos 200 sin duplicación; otro contenido responde 409.
- Se amplían pruebas, Swagger y documentación de migración del contrato antiguo.

## Contrato

```http
POST /api/v1/orders
Authorization: Bearer <accessToken>
Content-Type: application/json
```

```json
{
  "branchId": "10000000-0000-4000-8000-000000000001",
  "operationKey": "20000000-0000-4000-8000-000000000001",
  "paymentMode": "AT_COUNTER",
  "lines": [
    {
      "dishId": "30000000-0000-4000-8000-000000000001",
      "quantity": 2,
      "expectedPrice": "8.50"
    }
  ]
}
```

paymentMode es opcional y por omisión ONLINE; expectedPrice es opcional y no determina el importe cobrado. La respuesta añade paymentMode y pickupAt (ISO 8601 UTC). Se responde 201 al crear, 200 al repetir el mismo contenido y 409 ante conflicto.

## Compatibilidad

- El cliente antiguo debe migrar de /pedidos-llevar a /orders, de Idempotency-Key a operationKey y de campos en español a los DTO en inglés.
- EN_LINEA/EN_CAJA se expresan como ONLINE/AT_COUNTER.
- No se publica la ruta antigua ni sus errores 422 ni estado inicial PENDING_PAYMENT.
- Los clientes actuales de /orders pueden continuar sin enviar los campos opcionales nuevos.
- ONLINE explícito y omitido comparten huella de idempotencia; se conserva la huella previa de BE-02 cuando no se envía expectedPrice.
- No se añaden migraciones ni dependencias respecto de develop.

## Qué queda fuera y por qué

- Consumo real de inventario y validación agregada de recetas: corresponde a su integración; se eliminan los adaptadores que no consumían stock.
- Procesamiento de pagos: ya pertenece a BE-06 y continúa separado de crear el pedido.
- Frontend: debe adoptar el contrato documentado.
- Configuración de CI: estas comprobaciones se ejecutaron en el entorno de desarrollo.

## Cómo probarlo

Permitir binaries.prisma.sh y usar una base PostgreSQL exclusiva para pruebas:

```bash
npm ci
npm run prisma:generate
npm run prisma:deploy
npm run build
npm run lint
npx vitest run src/orders/services/orders.spec.ts
npx vitest run --config vitest.config.e2e.ts test/db-orders.e2e-spec.ts
npm run test:migrations
```

## Resultados registrados

Ejecución local del 7 de noviembre de 2026:

- [x] **34/34 pruebas de lógica y HTTP aprobadas**, con guard JWT real y repositorio simulado.
- [x] Lint sin tipos de los archivos de pedidos: sin incidencias.
- [x] Lint global: exit 0, con advertencias preexistentes y otras causadas por tipos de Prisma ausentes; no se afirma un lint limpio.
- [x] Aplicación, reversión y reaplicación de migraciones existentes: completadas correctamente en PostgreSQL temporal.
- [x] git diff --check: sin incidencias.
- [ ] **Generación de Prisma bloqueada**: descarga del checksum devuelve HTTP 403 desde binaries.prisma.sh.
- [ ] **Build fallido**: falta Prisma Client y sus tipos generados.
- [ ] **Integración real no completada**: la suite falla al inicializar; **16 casos omitidos**, ninguno aprobado contra AppModule/PostgreSQL.
- [ ] Suite global de pruebas y CI no ejecutados/verificados.

La ejecución inicial de los tests aislados detectó un import ausente en una aserción; se corrigió y se repitió la suite, con las 34 pruebas aprobadas.

**Antes de aprobar o fusionar:** habilitar la descarga de Prisma, regenerar el cliente y obtener resultados satisfactorios de build y de los 16 casos de integración real. Los tests aislados y de migraciones no sustituyen la validación completa.

## Integración

- Rama origen: feat/be-2.2.1-pedido-llevar.
- Rama destino: develop.
- El autor crea el PR y asigna reviewer.
- Detalles y mapeo del contrato: docs/decisiones/pedido-llevar.md.
