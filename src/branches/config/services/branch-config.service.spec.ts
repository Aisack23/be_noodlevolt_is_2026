import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { UserRole } from '@PrismaClient';
import type { BranchConfig } from '@PrismaClient';
import { BranchNotFoundError } from '../errors/index.js';
import { BranchConfigRepository } from '../repositories/index.js';
import { BranchConfigService } from './branch-config.service.js';

describe('BranchConfigService', () => {
  const branchId = 'branch-a';
  const manager = {
    id: 'manager',
    role: UserRole.BRANCH_ADMIN,
    branchId,
  };
  const repository = {
    findIsOpen: vi.fn<(branchId: string) => Promise<boolean>>(),
    setIsOpen:
      vi.fn<
        (
          branchId: string,
          isOpen: boolean,
          updatedBy: string,
        ) => Promise<BranchConfig>
      >(),
  };
  let service: BranchConfigService;

  beforeEach(async () => {
    vi.resetAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        BranchConfigService,
        { provide: BranchConfigRepository, useValue: repository },
      ],
    }).compile();
    service = module.get(BranchConfigService);
  });

  describe('getStatus', () => {
    it('expone solamente isOpen', async () => {
      repository.findIsOpen.mockResolvedValue(false);
      await expect(service.getStatus(branchId)).resolves.toEqual({
        isOpen: false,
      });
    });

    it('responde 404 si la sucursal no existe', async () => {
      repository.findIsOpen.mockRejectedValue(
        new BranchNotFoundError(branchId),
      );
      await expect(service.getStatus(branchId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('propaga los errores inesperados', async () => {
      const failure = new Error('sin conexión');
      repository.findIsOpen.mockRejectedValue(failure);
      await expect(service.getStatus(branchId)).rejects.toBe(failure);
    });
  });

  describe('updateStatus', () => {
    const updatedAt = new Date('2026-11-06T12:00:00.000Z');

    it('guarda el estado con el gerente como autor', async () => {
      repository.setIsOpen.mockResolvedValue({
        id: 'config',
        branchId,
        isOpen: false,
        updatedBy: manager.id,
        createdAt: updatedAt,
        updatedAt,
      });
      await expect(
        service.updateStatus(manager, branchId, false),
      ).resolves.toEqual({
        isOpen: false,
        updatedAt,
        updatedBy: manager.id,
      });
      expect(repository.setIsOpen).toHaveBeenCalledWith(
        branchId,
        false,
        manager.id,
      );
    });

    it('rechaza con 403 a un gerente de otra sucursal sin escribir', async () => {
      await expect(
        service.updateStatus(
          { ...manager, branchId: 'branch-b' },
          branchId,
          false,
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(repository.setIsOpen).not.toHaveBeenCalled();
    });

    it.each(
      Object.values(UserRole).filter((role) => role !== UserRole.BRANCH_ADMIN),
    )('rechaza con 403 al rol %s sin escribir', async (role) => {
      await expect(
        service.updateStatus({ ...manager, role }, branchId, false),
      ).rejects.toThrow(ForbiddenException);
      expect(repository.setIsOpen).not.toHaveBeenCalled();
    });

    it('responde 404 si la sucursal propia no existe o está inactiva', async () => {
      repository.setIsOpen.mockRejectedValue(new BranchNotFoundError(branchId));
      await expect(
        service.updateStatus(manager, branchId, true),
      ).rejects.toThrow(NotFoundException);
    });

    it('propaga los errores inesperados', async () => {
      const failure = new Error('sin conexión');
      repository.setIsOpen.mockRejectedValue(failure);
      await expect(service.updateStatus(manager, branchId, true)).rejects.toBe(
        failure,
      );
    });
  });
});
