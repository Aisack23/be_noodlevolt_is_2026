import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PageQueryDto } from '../../common/dto/page-query.dto.js';
import type { RewardsRepository } from './rewards.repository.js';
import { RewardsService } from './rewards.service.js';
import { RewardError } from './reward.error.js';

describe('Recompensas: permisos y errores de dominio', () => {
  const repository = { catalog: vi.fn(), history: vi.fn(), redeem: vi.fn() };
  const service = new RewardsService(
    repository as unknown as RewardsRepository,
  );
  const actor = { id: 'client', role: 'CLIENT' };
  const input = {
    benefitId: '73000000-0000-4000-8000-000000000001',
    orderId: 'A0000000-0000-4000-8000-000000000001',
    operationKey: 'B0000000-0000-4000-8000-000000000001',
  };
  beforeEach(() => vi.resetAllMocks());

  it.each([
    'WAITER',
    'COOK',
    'CASHIER',
    'INVENTORY_MANAGER',
    'BRANCH_ADMIN',
    'GENERAL_MANAGER',
  ])('rechaza %s antes de acceder a datos', async (role) => {
    const staff = { ...actor, role };
    expect(() => service.catalog(staff)).toThrow(ForbiddenException);
    expect(() => service.history(staff, new PageQueryDto())).toThrow(
      ForbiddenException,
    );
    await expect(service.redeem(staff, input)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(repository.catalog).not.toHaveBeenCalled();
    expect(repository.history).not.toHaveBeenCalled();
    expect(repository.redeem).not.toHaveBeenCalled();
  });

  it('normaliza UUID sin aceptar propietario ni importes desde el cliente', async () => {
    repository.redeem.mockResolvedValue({
      created: true,
      redemption: { id: 'redeemed' },
    });
    await service.redeem(actor, input);
    expect(repository.redeem).toHaveBeenCalledWith(actor.id, {
      benefitId: input.benefitId,
      orderId: input.orderId.toLowerCase(),
      operationKey: input.operationKey.toLowerCase(),
    });
  });

  it.each([
    ['NOT_FOUND', NotFoundException],
    ['CONFLICT', ConflictException],
  ] as const)('traduce %s a HTTP', async (kind, exception) => {
    repository.redeem.mockRejectedValue(
      new RewardError(kind, 'Error de canje'),
    );
    await expect(service.redeem(actor, input)).rejects.toBeInstanceOf(
      exception,
    );
  });

  it('conserva fallos inesperados para no presentar un canje falso', async () => {
    const error = new Error('Database unavailable');
    repository.redeem.mockRejectedValue(error);
    await expect(service.redeem(actor, input)).rejects.toBe(error);
  });
});
