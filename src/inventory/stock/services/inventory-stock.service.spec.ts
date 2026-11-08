import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma, type UserRole } from '@PrismaClient';
import { BranchNotFoundError } from '../errors/index.js';
import { InventoryStockRepository } from '../repositories/index.js';
import type { InventoryStockItem } from '../types/index.js';
import { InventoryStockService } from './inventory-stock.service.js';

describe('InventoryStockService', () => {
  const branchId = 'branch-a';
  const manager = { role: 'BRANCH_ADMIN' as const, branchId };
  const generalManager = { role: 'GENERAL_MANAGER' as const, branchId: null };
  const repository = {
    findByBranch: vi.fn<(id: string) => Promise<InventoryStockItem[]>>(),
    findInActiveBranches: vi.fn<() => Promise<InventoryStockItem[]>>(),
  };
  let service: InventoryStockService;

  function item(
    currentStock: string,
    minimumStock: string,
  ): InventoryStockItem {
    return {
      id: 'stock',
      branchId,
      branchName: 'Centro',
      name: 'Fideos',
      unit: 'kg',
      currentStock: new Prisma.Decimal(currentStock),
      minimumStock: new Prisma.Decimal(minimumStock),
      updatedAt: new Date('2026-11-05T18:00:00.000Z'),
    };
  }

  function expectNoRead() {
    expect(repository.findByBranch).not.toHaveBeenCalled();
    expect(repository.findInActiveBranches).not.toHaveBeenCalled();
  }

  beforeEach(async () => {
    vi.resetAllMocks();
    repository.findByBranch.mockResolvedValue([]);
    repository.findInActiveBranches.mockResolvedValue([]);
    const module = await Test.createTestingModule({
      providers: [
        InventoryStockService,
        { provide: InventoryStockRepository, useValue: repository },
      ],
    }).compile();
    service = module.get(InventoryStockService);
  });

  it('devuelve cantidades numéricas, unidad, sucursal y fecha', async () => {
    repository.findByBranch.mockResolvedValue([item('2.5', '4')]);
    expect(await service.getInventory(manager, undefined)).toEqual([
      {
        id: 'stock',
        branchId,
        branchName: 'Centro',
        name: 'Fideos',
        unit: 'kg',
        currentStock: 2.5,
        minimumStock: 4,
        isLowStock: true,
        updatedAt: '2026-11-05T18:00:00.000Z',
      },
    ]);
    expect(repository.findByBranch).toHaveBeenCalledWith(branchId);
    expect(repository.findInActiveBranches).not.toHaveBeenCalled();
  });

  it.each([
    ['por debajo del mínimo', '3', '5', true],
    ['sin existencias', '0', '2', true],
    ['igual al mínimo', '4', '4', true],
    ['igual al mínimo con otra escala', '4.000', '4', true],
    ['por encima del mínimo', '20', '8', false],
    ['una milésima por encima', '4.001', '4', false],
    ['sin existencias ni mínimo', '0', '0', true],
  ])('calcula isLowStock %s', async (_case, current, minimum, isLowStock) => {
    repository.findByBranch.mockResolvedValue([item(current, minimum)]);
    const [result] = await service.getInventory(manager, undefined);
    expect(result.isLowStock).toBe(isLowStock);
  });

  it('conserva cantidad y umbral en el máximo de NUMERIC(14,3)', async () => {
    repository.findByBranch.mockResolvedValue([
      item('99999999999.999', '99999999999.998'),
    ]);
    const [result] = await service.getInventory(manager, undefined);
    expect(result.isLowStock).toBe(false);
    expect(result.currentStock).toBe(99999999999.999);
  });

  it('devuelve una lista vacía si la sucursal no tiene existencias', async () => {
    expect(await service.getInventory(manager, undefined)).toEqual([]);
  });

  it('acepta un branchId igual a la sucursal del gerente', async () => {
    await service.getInventory(manager, branchId);
    expect(repository.findByBranch).toHaveBeenCalledWith(branchId);
  });

  it.each([
    ['de otra sucursal', 'branch-b'],
    ['vacío', ''],
    ['repetido', [branchId, 'branch-b']],
  ])(
    'rechaza al gerente con un branchId %s sin leer existencias',
    async (_case, requested) => {
      await expect(
        service.getInventory(manager, requested),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expectNoRead();
    },
  );

  it('devuelve al gerente general las sucursales activas', async () => {
    repository.findInActiveBranches.mockResolvedValue([item('1', '2')]);
    await expect(
      service.getInventory(generalManager, undefined),
    ).resolves.toHaveLength(1);
    expect(repository.findByBranch).not.toHaveBeenCalled();
  });

  it('rechaza al gerente general si envía branchId', async () => {
    await expect(
      service.getInventory(generalManager, branchId),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expectNoRead();
  });

  it.each<UserRole>([
    'CLIENT',
    'WAITER',
    'COOK',
    'CASHIER',
    'INVENTORY_MANAGER',
  ])('rechaza el rol %s sin leer existencias', async (role) => {
    await expect(
      service.getInventory({ role, branchId }, undefined),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expectNoRead();
  });

  it('traduce una sucursal inactiva a 404', async () => {
    repository.findByBranch.mockRejectedValue(
      new BranchNotFoundError(branchId),
    );
    const failure = service.getInventory(manager, undefined);
    await expect(failure).rejects.toBeInstanceOf(NotFoundException);
    await expect(failure).rejects.toThrow('La sucursal no existe.');
  });

  it('no oculta errores inesperados del repositorio', async () => {
    const error = new Error('fallo de conexión');
    repository.findByBranch.mockRejectedValue(error);
    await expect(service.getInventory(manager, undefined)).rejects.toBe(error);
  });
});
