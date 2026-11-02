export class TakeoutBranchInvalidError extends Error {
  constructor() {
    super('La sucursal no es válida.');
  }
}

export class TakeoutUnavailableError extends Error {
  constructor(readonly dishes: { dishId: string; name: string | null }[]) {
    super('Hay platillos no disponibles.');
  }
}

export class TakeoutPriceConflictError extends Error {
  constructor(readonly prices: { dishId: string; currentPrice: string }[]) {
    super('Los precios del carrito cambiaron.');
  }
}

export class TakeoutIdempotencyConflictError extends Error {
  constructor() {
    super('La clave de idempotencia ya se usó con otro contenido.');
  }
}
