import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  KitchenOrderTransitionError,
  OrderRepository,
} from '@AccountsOrders/repositories';
import { KitchenService } from './kitchen.service.js';

const branchId = '10000000-0000-4000-8000-000000000001';
const cook = {
  id: '20000000-0000-4000-8000-000000000001',
  role: 'COOK',
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
      service.list({ ...cook, role: 'WAITER' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.list({ ...cook, branchId: null }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.findKitchenQueue).not.toHaveBeenCalled();
  });

  it('traduce pedido fuera de alcance a 404 y transición inválida a 409', async () => {
    repository.transitionKitchenStatus.mockResolvedValueOnce(null);
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
