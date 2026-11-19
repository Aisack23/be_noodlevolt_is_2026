import { Prisma } from '@PrismaClient';
import type { PrismaService } from '@Prisma/services';
import { calculatePoints } from '../domain/index.js';
import type { LoyaltyPayment } from '../domain/index.js';
import { LoyaltyAccrualError } from '../errors/index.js';
import { LoyaltyRepository } from '../repositories/loyalty.repository.js';

describe('HU-07. Acumular puntos por pago', () => {
  const branchId = '10000000-0000-4000-8000-000000000001';
  const customerId = '20000000-0000-4000-8000-000000000001';
  const paymentId = '30000000-0000-4000-8000-000000000001';

  function payment(overrides: Partial<LoyaltyPayment> = {}): LoyaltyPayment {
    return {
      status: 'PAID',
      totalPaid: new Prisma.Decimal('12.99'),
      branchId,
      order: {
        customerId,
        customer: { role: 'CLIENT' },
        branchId,
        status: 'PENDING',
      },
      ...overrides,
    };
  }

  // Simula la transacción de Prisma: el repositorio solo ve estos métodos.
  let tx: {
    payment: { findUnique: ReturnType<typeof vi.fn> };
    $executeRaw: ReturnType<typeof vi.fn>;
    loyaltyAccount: { upsert: ReturnType<typeof vi.fn> };
  };
  let repository: LoyaltyRepository;

  beforeEach(() => {
    vi.resetAllMocks();
    tx = {
      payment: {
        findUnique: vi.fn().mockResolvedValue({
          status: 'PAID',
          totalPaid: new Prisma.Decimal('12.99'),
          branchId,
          order: {
            customerId,
            status: 'PENDING',
            branchId,
            customer: { role: 'CLIENT' },
          },
        }),
      },
      $executeRaw: vi.fn().mockResolvedValue(1),
      loyaltyAccount: { upsert: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: vi.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    repository = new LoyaltyRepository(prisma as unknown as PrismaService);
  });

  it('AC1: acredita un punto por cada dólar completo del pago', () => {
    expect(calculatePoints(payment())).toBe(12);
  });

  it('AC1 (negativo): un pago menor a un dólar no acredita puntos', () => {
    expect(
      calculatePoints(payment({ totalPaid: new Prisma.Decimal('0.99') })),
    ).toBe(0);
  });

  it('AC1 (negativo): un monto negativo se rechaza como error de acreditación', () => {
    expect(() =>
      calculatePoints(payment({ totalPaid: new Prisma.Decimal('-1.00') })),
    ).toThrow(LoyaltyAccrualError);
  });

  it('AC1: al confirmar el pago guarda el movimiento y suma los puntos al saldo', async () => {
    await repository.accruePayment(paymentId);

    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.loyaltyAccount.upsert).toHaveBeenCalledExactlyOnceWith({
      where: { userId: customerId },
      create: { userId: customerId, points: 12 },
      update: { points: { increment: 12 } },
    });
  });

  it('AC2: un pago rechazado no acredita puntos', async () => {
    tx.payment.findUnique.mockResolvedValue({
      status: 'REJECTED',
      totalPaid: new Prisma.Decimal('12.99'),
      branchId,
      order: {
        customerId,
        status: 'PENDING',
        branchId,
        customer: { role: 'CLIENT' },
      },
    });

    await repository.accruePayment(paymentId);

    expect(calculatePoints(payment({ status: 'REJECTED' }))).toBe(0);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(tx.loyaltyAccount.upsert).not.toHaveBeenCalled();
  });

  it('AC3: reprocesar el mismo evento de pago no duplica el saldo', async () => {
    tx.$executeRaw.mockResolvedValueOnce(1).mockResolvedValueOnce(0);

    await repository.accruePayment(paymentId);
    await repository.accruePayment(paymentId);

    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
    expect(tx.loyaltyAccount.upsert).toHaveBeenCalledTimes(1);
  });
});
