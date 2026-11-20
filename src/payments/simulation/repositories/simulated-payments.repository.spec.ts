import { ConflictException } from '@nestjs/common';
import type { LoyaltyRepository } from '@CustomerFeatures/repositories';
import { PrismaService } from '@Prisma/services';
import { SimulatedPaymentsRepository } from './simulated-payments.repository.js';

const owner = '10000000-0000-4000-8000-000000000001';
const orderId = '20000000-0000-4000-8000-000000000001';

describe('SimulatedPaymentsRepository: tipo de pedido y revalidación transaccional', () => {
  const transaction = {
    $queryRaw: vi.fn(),
    order: { findUnique: vi.fn() },
    payment: { findFirst: vi.fn(), create: vi.fn() },
  };
  const prisma = {
    order: { findUnique: vi.fn() },
    payment: { findFirst: vi.fn() },
    async $transaction<T>(
      callback: (tx: typeof transaction) => Promise<T>,
    ): Promise<T> {
      return callback(transaction);
    },
  };
  const loyalty = { accruePayment: vi.fn() };
  const repository = new SimulatedPaymentsRepository(
    prisma as unknown as PrismaService,
    loyalty as unknown as LoyaltyRepository,
  );
  beforeEach(() => {
    vi.resetAllMocks();
    transaction.$queryRaw.mockResolvedValue([]);
    prisma.order.findUnique.mockResolvedValue({
      customerId: owner,
      status: 'PENDING',
      type: 'TAKEOUT',
    });
    prisma.payment.findFirst.mockResolvedValue(null);
  });
  it.each(['DINE_IN', 'DELIVERY'])(
    'rechaza %s antes de consultar pagos',
    async (type) => {
      prisma.order.findUnique.mockResolvedValue({
        customerId: owner,
        status: 'PENDING',
        type,
      });
      await expect(
        repository.requirePayable(orderId, owner),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.payment.findFirst).not.toHaveBeenCalled();
    },
  );
  it.each(['DINE_IN', 'DELIVERY'])(
    'revalida %s bajo bloqueo después de una prevalidación válida',
    async (type) => {
      await repository.requirePayable(orderId, owner);
      transaction.order.findUnique.mockResolvedValue({
        customerId: owner,
        status: 'PENDING',
        type,
      });
      await expect(
        repository.record(orderId, owner, {
          approved: true,
          last4: '4242',
          reason: null,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(transaction.$queryRaw).toHaveBeenCalledOnce();
      expect(transaction.payment.create).not.toHaveBeenCalled();
    },
  );
});
