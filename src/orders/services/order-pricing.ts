import { ConflictException } from '@nestjs/common';
import { normalizePrice } from './order-request.js';

export function assertExpectedPrice(
  expectedPrice: string | undefined,
  currentPrice: string,
  dishId: string,
): void {
  if (
    expectedPrice === undefined ||
    normalizePrice(expectedPrice) === currentPrice
  )
    return;
  throw new ConflictException({
    message: 'Los precios del carrito cambiaron.',
    prices: [{ dishId, currentPrice }],
  });
}
