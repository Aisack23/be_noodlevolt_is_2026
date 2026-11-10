export class KitchenOrderNotFoundError extends Error {
  constructor() {
    super('El pedido no existe en esta sucursal.');
  }
}

export class KitchenOrderTransitionError extends Error {
  constructor(
    readonly current: string,
    readonly next: string,
  ) {
    super(
      'La transición no corresponde al estado actual del pedido; no se pueden saltar etapas.',
    );
  }
}

export class KitchenOrderIntegrityError extends Error {
  constructor() {
    super('No se pudo registrar el cambio por un conflicto de integridad.');
  }
}
