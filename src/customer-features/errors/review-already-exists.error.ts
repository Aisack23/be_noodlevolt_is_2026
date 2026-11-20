/**
 * Error de dominio: la reseña ya existe para un pedido.
 *
 * Lo lanza el repositorio al detectar la violación de unicidad en `reviews`.
 */
export class ReviewAlreadyExistsError extends Error {
  constructor(public readonly orderId: string) {
    super(`Ya existe una reseña para el pedido "${orderId}".`);
    this.name = 'ReviewAlreadyExistsError';
  }
}
