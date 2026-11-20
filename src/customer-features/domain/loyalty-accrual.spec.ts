import { Prisma } from '@PrismaClient';
import { calculatePoints, type LoyaltyPayment } from './loyalty-accrual.js';
import { LoyaltyAccrualError } from '../errors/loyalty-accrual.error.js';

const payment: LoyaltyPayment = {
  status: 'PAID',
  totalPaid: new Prisma.Decimal('12.75'),
  branchId: 'branch',
  order: {
    customerId: 'customer',
    customer: { role: 'CLIENT' },
    status: 'PENDING',
    branchId: 'branch',
  },
};

describe('BE-07: reglas de acreditación', () => {
  it.each([
    ['0.00', 0],
    ['0.29', 0],
    ['0.99', 0],
    ['1.00', 1],
    ['12.75', 12],
    ['99999999.99', 99999999],
    ['2147483647.99', 2147483647],
  ])('acredita el floor de %s como %i puntos', (totalPaid, points) => {
    expect(
      calculatePoints({ ...payment, totalPaid: new Prisma.Decimal(totalPaid) }),
    ).toBe(points);
  });
  it.each(['REJECTED', 'PENDING', 'REFUNDED'])(
    'no acredita un pago %s',
    (status) => {
      expect(calculatePoints({ ...payment, status })).toBe(0);
    },
  );
  it.each([
    null,
    { ...payment.order!, customerId: null },
    { ...payment.order!, customer: { role: 'WAITER' } },
    { ...payment.order!, status: 'CANCELED' },
    { ...payment.order!, branchId: 'other-branch' },
  ])('omite pagos sin cliente elegible o con pedido inválido %#', (order) => {
    expect(calculatePoints({ ...payment, order })).toBe(0);
  });
  it.each(['2147483648.00', '-1.00', 'NaN', 'Infinity'])(
    'rechaza puntos no representables: %s',
    (totalPaid) => {
      expect(() =>
        calculatePoints({
          ...payment,
          totalPaid: new Prisma.Decimal(totalPaid),
        }),
      ).toThrow(LoyaltyAccrualError);
    },
  );
});
