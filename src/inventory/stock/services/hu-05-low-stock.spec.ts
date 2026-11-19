import { ForbiddenException, ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@PrismaClient';
import request from 'supertest';
import { InventoryStockController } from '../controllers/inventory-stock.controller.js';
import { InventoryStockRepository } from '../repositories/index.js';
import type { InventoryStockItem } from '../types/index.js';
import { InventoryStockService } from './inventory-stock.service.js';

vi.mock('@Prisma/services', () => ({ PrismaService: class {} }));

describe('HU-05. Consultar insumos con bajo stock', () => {
  const branchId = 'branch-a';
  const otherBranchId = 'branch-b';
  const manager = { id: 'manager-a', role: 'BRANCH_ADMIN' as const, branchId };
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
      id: `stock-${currentStock}-${minimumStock}`,
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

  describe('servicio', () => {
    it('AC1: devuelve cantidad actual y mínimo de los insumos de mi sucursal', async () => {
      repository.findByBranch.mockResolvedValue([item('3', '5')]);

      const [row] = await service.getInventory(manager, undefined);

      expect(repository.findByBranch).toHaveBeenCalledExactlyOnceWith(branchId);
      expect(row).toMatchObject({
        branchId,
        name: 'Fideos',
        unit: 'kg',
        currentStock: 3,
        minimumStock: 5,
      });
    });

    it('AC2: marca como stock bajo el insumo que está en su mínimo o por debajo', async () => {
      repository.findByBranch.mockResolvedValue([
        item('5', '5'),
        item('2', '5'),
      ]);

      const rows = await service.getInventory(manager, undefined);

      expect(rows.map((row) => row.isLowStock)).toEqual([true, true]);
    });

    it('AC2 (negativo): no marca stock bajo el insumo que supera su mínimo', async () => {
      repository.findByBranch.mockResolvedValue([item('6', '5')]);

      const [row] = await service.getInventory(manager, undefined);

      expect(row.isLowStock).toBe(false);
    });

    it('AC3: rechaza el inventario de otra sucursal sin consultar existencias', async () => {
      await expect(
        service.getInventory(manager, otherBranchId),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expectNoRead();
    });

    it('AC3 (negativo): rechaza a un rol sin acceso al inventario', async () => {
      await expect(
        service.getInventory(
          { id: 'waiter', role: 'WAITER' as const, branchId },
          undefined,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expectNoRead();
    });
  });

  describe('controlador HTTP', () => {
    let actor: object;
    let app: INestApplication;

    beforeEach(async () => {
      actor = manager;
      const module = await Test.createTestingModule({
        controllers: [InventoryStockController],
        providers: [
          InventoryStockService,
          { provide: InventoryStockRepository, useValue: repository },
        ],
      }).compile();
      app = module.createNestApplication();
      app.use((req, _res, next) => {
        Object.assign(req, { user: actor });
        next();
      });
      app.useGlobalPipes(
        new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: true,
          transform: true,
        }),
      );
      await app.init();
    });

    afterEach(async () => {
      await app.close();
    });

    it('AC3: responde 403 a una petición de otra sucursal sin exponer existencias', async () => {
      repository.findByBranch.mockResolvedValue([item('3', '5')]);

      const response = await request(app.getHttpServer())
        .get('/inventory')
        .query({ branchId: otherBranchId })
        .expect(403);

      expect(JSON.stringify(response.body)).not.toContain('Fideos');
      expectNoRead();
    });

    it('AC1: responde 200 con las existencias de la sucursal propia', async () => {
      repository.findByBranch.mockResolvedValue([item('3', '5')]);

      const response = await request(app.getHttpServer())
        .get('/inventory')
        .query({ branchId })
        .expect(200);

      expect(response.body).toEqual([
        expect.objectContaining({
          branchId,
          currentStock: 3,
          minimumStock: 5,
          isLowStock: true,
        }),
      ]);
    });
  });
});
