import { ForbiddenException } from '@nestjs/common';
import { LoyaltyService } from './loyalty.service.js';
import type { LoyaltyRepository } from '../repositories/loyalty.repository.js';

vi.mock('../repositories/loyalty.repository.js', () => ({
  LoyaltyRepository: class {},
}));

describe('BE-07: consulta de saldo', () => {
  const repository = { getBalance: vi.fn() };
  const service = new LoyaltyService(
    repository as unknown as LoyaltyRepository,
  );
  beforeEach(() => vi.resetAllMocks());

  it.each([0, 12])(
    'devuelve el saldo %i para el usuario de la sesión',
    async (points) => {
      repository.getBalance.mockResolvedValue(points);
      await expect(
        service.getBalance({ id: 'customer-a', role: 'CLIENT' }),
      ).resolves.toEqual({ points });
      expect(repository.getBalance).toHaveBeenCalledExactlyOnceWith(
        'customer-a',
      );
    },
  );
  it.each([
    'WAITER',
    'COOK',
    'CASHIER',
    'INVENTORY_MANAGER',
    'BRANCH_ADMIN',
    'GENERAL_MANAGER',
  ])('rechaza el rol %s antes de consultar la cuenta', async (role) => {
    await expect(service.getBalance({ id: 'staff', role })).rejects.toThrow(
      ForbiddenException,
    );
    expect(repository.getBalance).not.toHaveBeenCalled();
  });
  it('conserva el error del repositorio sin devolver un saldo falso', async () => {
    const failure = new Error('Base no disponible');
    repository.getBalance.mockRejectedValue(failure);
    await expect(
      service.getBalance({ id: 'customer-a', role: 'CLIENT' }),
    ).rejects.toBe(failure);
  });
});
