import { describe, expect, it, vi } from 'vitest';
import { TopDishesRepository } from './top-dishes.repository.js';

describe('TopDishesRepository', () => {
  it('filtra pedidos no cancelados y pagos PAID en el rango, y suma quantity', async () => {
    const prisma = {
      orderItem: {
        findMany: vi.fn().mockResolvedValue([
          { dishId: 'dish-a', dishName: 'Ramen', quantity: 2 },
          { dishId: 'dish-a', dishName: 'Ramen', quantity: 3 },
          { dishId: 'dish-b', dishName: 'Gyoza', quantity: 1 },
        ]),
      },
    };
    const repository = new TopDishesRepository(prisma as never);
    const result = await repository.findSoldItems({
      branchId: 'branch-a',
      start: new Date('2026-01-15T06:00:00.000Z'),
      end: new Date('2026-01-17T06:00:00.000Z'),
    });

    expect(prisma.orderItem.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        order: {
          is: expect.objectContaining({
            branchId: 'branch-a',
            status: { not: 'CANCELED' },
            payments: {
              some: expect.objectContaining({
                status: 'PAID',
              }),
            },
          }),
        },
      }),
    }));
    expect(result).toEqual([
      { dishId: 'dish-a', dishName: 'Ramen', quantity: 5 },
      { dishId: 'dish-b', dishName: 'Gyoza', quantity: 1 },
    ]);
  });
});

