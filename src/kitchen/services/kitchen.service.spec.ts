import { UserRole } from '@PrismaClient';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { OrderRepository } from '@AccountsOrders/repositories';
import {
  KitchenOrderTransitionError,
  KitchenOrderNotFoundError,
  KitchenOrderIntegrityError,
} from '@AccountsOrders/errors';
import { KitchenService } from './kitchen.service.js';

const branchId = '10000000-0000-4000-8000-000000000001';
const cook = {
  id: '20000000-0000-4000-8000-000000000001',
  role: UserRole.COOK,
  branchId,
};
const order = {
  id: '30000000-0000-4000-8000-000000000001',
  branchId,
  orderNumber: 'A-1',
  type: 'TAKEOUT',
  status: 'PENDING',
  createdAt: new Date('2026-11-09T12:00:00.000Z'),
  items: [
    {
      id: '40000000-0000-4000-8000-000000000001',
      dishName: 'Ramen',
      quantity: 2,
      note: null,
      status: 'PENDING',
    },
  ],
} as const;

describe('KitchenService', () => {
  const repository = {
    findKitchenQueue: vi.fn(),
    findReadyQueue: vi.fn(),
    transitionKitchenStatus: vi.fn(),
  };
  const service = new KitchenService(repository as unknown as OrderRepository);

  beforeEach(() => vi.resetAllMocks());

  it('limita la cola a la sucursal del cocinero y devuelve estados persistidos', async () => {
    repository.findKitchenQueue.mockResolvedValue([order]);

    await expect(service.list(cook)).resolves.toEqual([
      {
        id: order.id,
        orderNumber: order.orderNumber,
        type: 'TAKEOUT',
        status: 'PENDING',
        createdAt: order.createdAt,
        items: [
          {
            id: order.items[0].id,
            name: 'Ramen',
            quantity: 2,
            note: null,
            status: 'PENDING',
          },
        ],
      },
    ]);
    expect(repository.findKitchenQueue).toHaveBeenCalledWith(branchId);
  });

  it('persiste la transición usando actor y sucursal de la sesión', async () => {
    repository.transitionKitchenStatus.mockResolvedValue({
      ...order,
      status: 'IN_PREPARATION',
      items: [{ ...order.items[0], status: 'IN_PREPARATION' }],
    });

    await expect(
      service.updateStatus(cook, order.id, { status: 'IN_PREPARATION' }),
    ).resolves.toMatchObject({ status: 'IN_PREPARATION' });
    expect(repository.transitionKitchenStatus).toHaveBeenCalledWith(
      branchId,
      order.id,
      cook.id,
      'IN_PREPARATION',
    );
  });

  it('no permite que roles ajenos ni cocina sin sucursal operen el flujo', async () => {
    await expect(
      service.list({ ...cook, role: UserRole.WAITER }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.list({ ...cook, branchId: null }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.findKitchenQueue).not.toHaveBeenCalled();
  });

  it('lista READY y entrega con la identidad y sucursal del mesero', async () => {
    const waiter = { ...cook, role: UserRole.WAITER };
    repository.findReadyQueue.mockResolvedValue([
      { ...order, status: 'READY' },
    ]);
    await expect(service.listReady(waiter)).resolves.toMatchObject([
      { status: 'READY' },
    ]);
    expect(repository.findReadyQueue).toHaveBeenCalledWith(branchId);
    repository.transitionKitchenStatus.mockResolvedValue({
      ...order,
      status: 'DELIVERED',
    });
    await expect(service.deliver(waiter, order.id)).resolves.toMatchObject({
      status: 'DELIVERED',
    });
    expect(repository.transitionKitchenStatus).toHaveBeenCalledWith(
      branchId,
      order.id,
      waiter.id,
      'DELIVERED',
    );
  });

  it('solo meseros con sucursal pueden listar listos y entregar', async () => {
    for (const actor of [
      cook,
      { ...cook, role: UserRole.WAITER, branchId: null },
    ]) {
      await expect(service.listReady(actor)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(service.deliver(actor, order.id)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    }
    expect(repository.findReadyQueue).not.toHaveBeenCalled();
    expect(repository.transitionKitchenStatus).not.toHaveBeenCalled();
  });

  it('entrega traduce 404, transición 409 e integridad 409 y propaga errores inesperados', async () => {
    const waiter = { ...cook, role: UserRole.WAITER };
    for (const [error, expected] of [
      [new KitchenOrderNotFoundError(), NotFoundException],
      [
        new KitchenOrderTransitionError('PENDING', 'DELIVERED'),
        ConflictException,
      ],
      [new KitchenOrderIntegrityError(), ConflictException],
    ] as const) {
      repository.transitionKitchenStatus.mockRejectedValueOnce(error);
      await expect(service.deliver(waiter, order.id)).rejects.toBeInstanceOf(
        expected,
      );
    }
    const unexpected = new Error('Database unavailable');
    repository.transitionKitchenStatus.mockRejectedValueOnce(unexpected);
    await expect(service.deliver(waiter, order.id)).rejects.toBe(unexpected);
  });

  it('traduce pedido fuera de alcance a 404 y transición inválida a 409', async () => {
    repository.transitionKitchenStatus.mockRejectedValueOnce(
      new KitchenOrderNotFoundError(),
    );
    await expect(
      service.updateStatus(cook, order.id, { status: 'READY' }),
    ).rejects.toBeInstanceOf(NotFoundException);

    repository.transitionKitchenStatus.mockRejectedValueOnce(
      new KitchenOrderTransitionError('PENDING', 'READY'),
    );
    await expect(
      service.updateStatus(cook, order.id, { status: 'READY' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
