import { OrderReadyNotifier } from '@AccountsOrders/ports';
import { OrderRepository } from './order.repository.js';
import { Prisma } from '@PrismaClient';
import type { PrismaService } from '@Prisma/services';
import {
  KitchenOrderIntegrityError,
  KitchenOrderNotFoundError,
} from '@AccountsOrders/errors';

describe('OrderRepository: errores de persistencia del flujo de cocina', () => {
  const transaction = vi.fn();
  const notifier = { notifyOrderReady: vi.fn() } satisfies OrderReadyNotifier;
  const repository = new OrderRepository(
    { $transaction: transaction } as unknown as PrismaService,
    notifier,
  );

  beforeEach(() => vi.resetAllMocks());

  it.each([
    ['P2002', KitchenOrderIntegrityError],
    ['P2003', KitchenOrderIntegrityError],
    ['P2025', KitchenOrderNotFoundError],
  ] as const)('traduce %s a error de dominio', async (code, domainError) => {
    transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Error de persistencia', {
        code,
        clientVersion: '7.10.0',
      }),
    );
    await expect(
      repository.transitionKitchenStatus('branch', 'order', 'user', 'READY'),
    ).rejects.toBeInstanceOf(domainError);
  });

  it('conserva un fallo inesperado para no convertirlo en error de negocio', async () => {
    const failure = new Error('Connection lost');
    transaction.mockRejectedValueOnce(failure);
    await expect(
      repository.transitionKitchenStatus('branch', 'order', 'user', 'READY'),
    ).rejects.toBe(failure);
  });
  it.each(['IN_PREPARATION', 'READY'] as const)(
    'con estado %s comparte el cliente transaccional solo en avances reales a READY',
    async (current) => {
      const row = { id: 'order', status: 'READY' };
      const tx = {
        $queryRaw: vi
          .fn()
          .mockResolvedValue([{ id: 'order', status: current }]),
        order: {
          update: vi.fn(),
          findUniqueOrThrow: vi.fn().mockResolvedValue(row),
        },
        orderItem: { updateMany: vi.fn() },
        orderStatusHistory: { create: vi.fn() },
      };
      transaction.mockImplementationOnce(
        (work: (client: typeof tx) => Promise<unknown>) => work(tx),
      );
      await expect(
        repository.transitionKitchenStatus('branch', 'order', 'user', 'READY'),
      ).resolves.toEqual(row);
      if (current === 'IN_PREPARATION') {
        expect(notifier.notifyOrderReady).toHaveBeenCalledExactlyOnceWith(
          'order',
          tx,
        );
        expect(tx.order.update).toHaveBeenCalledWith({
          where: { id: 'order' },
          data: { status: 'READY', updatedBy: 'user' },
        });
        expect(tx.orderStatusHistory.create).toHaveBeenCalledOnce();
      } else {
        expect(notifier.notifyOrderReady).not.toHaveBeenCalled();
        expect(tx.order.update).not.toHaveBeenCalled();
        expect(tx.orderStatusHistory.create).not.toHaveBeenCalled();
      }
    },
  );
});
