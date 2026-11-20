import { describe, expect, it, vi } from 'vitest';
import { TopDishesService } from './top-dishes.service.js';

describe('TopDishesService', () => {
  it('consolida cantidades por platillo y aplica limit para GENERAL_MANAGER', async () => {
    const repository = {
      findSoldItems: vi.fn()
        .mockResolvedValueOnce([
          { dishId: 'dish-a', dishName: 'Ramen', quantity: 5 },
          { dishId: 'dish-b', dishName: 'Gyoza', quantity: 3 },
        ])
        .mockResolvedValueOnce([
          { dishId: 'dish-a', dishName: 'Ramen', quantity: 4 },
          { dishId: 'dish-c', dishName: 'Té', quantity: 2 },
        ]),
    };
    const branchRepository = {
      findAll: vi.fn().mockResolvedValue([
        { id: 'branch-a', timeZone: 'America/El_Salvador' },
        { id: 'branch-b', timeZone: 'America/El_Salvador' },
      ]),
      findById: vi.fn(),
    };
    const service = new TopDishesService(repository as never, branchRepository as never);

    const result = await service.getTopDishes(
      { role: 'GENERAL_MANAGER', branchId: null },
      { from: '2026-01-15', to: '2026-01-16', branchId: undefined, limit: 2 },
    );

    expect(result.branchId).toBeNull();
    expect(result.dishes).toEqual([
      { dishId: 'dish-a', dishName: 'Ramen', quantity: 9 },
      { dishId: 'dish-b', dishName: 'Gyoza', quantity: 3 },
    ]);
  });

  it('impide que BRANCH_ADMIN consulte una sucursal ajena', async () => {
    const service = new TopDishesService(
      { findSoldItems: vi.fn() } as never,
      { findById: vi.fn(), findAll: vi.fn() } as never,
    );

    await expect(service.getTopDishes(
      { role: 'BRANCH_ADMIN', branchId: 'branch-a' },
      { from: '2026-01-15', to: '2026-01-15', branchId: 'branch-b', limit: 10 },
    )).rejects.toMatchObject({ status: 403 });
  });
});

