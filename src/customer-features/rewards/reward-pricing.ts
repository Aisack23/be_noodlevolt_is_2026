import { Prisma } from '@PrismaClient';
import { RewardError } from './reward.error.js';

export function rewardDiscount(
  subtotal: Prisma.Decimal,
  percent: number | null,
): Prisma.Decimal {
  if (
    subtotal.lte(0) ||
    !Number.isInteger(percent) ||
    percent === null ||
    percent < 1 ||
    percent > 99
  ) {
    throw new RewardError(
      'CONFLICT',
      'La recompensa o el importe no permiten calcular el descuento.',
    );
  }
  const discount = subtotal
    .mul(percent)
    .div(100)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  if (discount.gte(subtotal)) {
    throw new RewardError(
      'CONFLICT',
      'El descuento debe conservar un importe positivo para el pago.',
    );
  }
  return discount;
}
