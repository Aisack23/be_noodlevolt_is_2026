import { Prisma } from '@PrismaClient';
import { rewardDiscount } from './reward-pricing.js';
import { RewardError } from './reward.error.js';

describe('Descuento de recompensas con importes decimales', () => {
  it('rechaza una configuración cuyo redondeo consumiría todo el importe', () => {
    expect(() => rewardDiscount(new Prisma.Decimal('0.01'), 99)).toThrow(
      RewardError,
    );
  });
  it.each([
    ['17.00', 10, '1.70'],
    ['10.05', 10, '1.01'],
    ['0.01', 10, '0.00'],
    ['99999999.99', 10, '10000000.00'],
  ])(
    'calcula %s al %i%% con redondeo a centavos',
    (amount, percent, expected) => {
      expect(
        rewardDiscount(new Prisma.Decimal(amount), percent).toFixed(2),
      ).toBe(expected);
    },
  );

  it.each([0, -1, 100, 1.5, null])(
    'rechaza porcentaje inválido %s',
    (percent) => {
      expect(() =>
        rewardDiscount(new Prisma.Decimal('17.00'), percent),
      ).toThrow(RewardError);
    },
  );

  it.each(['0', '-1'])('rechaza importe %s', (amount) => {
    expect(() => rewardDiscount(new Prisma.Decimal(amount), 10)).toThrow(
      RewardError,
    );
  });
});
