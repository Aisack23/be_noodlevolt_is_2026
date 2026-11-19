import {
  ConflictException,
  ForbiddenException,
  ValidationPipe,
} from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { UserRole } from '@PrismaClient';
import type { BranchConfig } from '@PrismaClient';
import request from 'supertest';
import type { CreateOrderDto } from '../../../orders/dto/create-order.dto.js';
import { OrdersRepository } from '../../../orders/repositories/orders.repository.js';
import { OrdersService } from '../../../orders/services/orders.service.js';
import { BranchConfigController } from '../controllers/branch-config.controller.js';
import { BranchConfigRepository } from '../repositories/index.js';
import { BranchConfigService } from './branch-config.service.js';

vi.mock('../../../orders/repositories/orders.repository.js', () => ({
  OrdersRepository: class {},
}));
vi.mock('@Prisma/services', () => ({ PrismaService: class {} }));

describe('HU-11. Actualizar estado operativo de sucursal', () => {
  const branchA = '10000000-0000-4000-8000-000000000001';
  const branchB = '10000000-0000-4000-8000-000000000002';
  const manager = {
    id: 'manager-a',
    role: UserRole.BRANCH_ADMIN,
    branchId: branchA,
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

  function config(isOpen: boolean): BranchConfig {
    return {
      branchId: branchA,
      isOpen,
      updatedAt: new Date('2026-11-18T12:00:00.000Z'),
      updatedBy: manager.id,
    } as BranchConfig;
  }

  beforeEach(async () => {
    vi.resetAllMocks();
    repository.findIsOpen.mockResolvedValue(true);
    repository.setIsOpen.mockResolvedValue(config(false));
    const module = await Test.createTestingModule({
      providers: [
        BranchConfigService,
        { provide: BranchConfigRepository, useValue: repository },
      ],
    }).compile();
    service = module.get(BranchConfigService);
  });

  describe('servicio de sucursal', () => {
    it('AC1: guarda CERRADA cuando el gerente cierra una sucursal abierta', async () => {
      const result = await service.updateStatus(manager, branchA, false);

      expect(repository.setIsOpen).toHaveBeenCalledExactlyOnceWith(
        branchA,
        false,
        manager.id,
      );
      expect(result.isOpen).toBe(false);
    });

    it('AC3: rechaza con 403 a un gerente de otra sucursal sin escribir', async () => {
      await expect(
        service.updateStatus(manager, branchB, false),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(repository.setIsOpen).not.toHaveBeenCalled();
    });

    it('AC3 (negativo): rechaza con 403 a un rol que no es gerente de sucursal', async () => {
      await expect(
        service.updateStatus(
          { id: 'cashier', role: UserRole.CASHIER, branchId: branchA },
          branchA,
          false,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(repository.setIsOpen).not.toHaveBeenCalled();
    });
  });

  describe('servicio de pedidos con sucursal cerrada', () => {
    const customer = { id: 'client-1', role: 'CLIENT' };
    const input: CreateOrderDto = {
      branchId: branchA,
      operationKey: '30000000-0000-4000-8000-000000000001',
      lines: [{ dishId: 'aaaaaaaa-0000-4000-8000-000000000001', quantity: 2 }],
    };
    const ordersRepository = { create: vi.fn() };
    let orders: OrdersService;

    beforeEach(async () => {
      const module = await Test.createTestingModule({
        providers: [
          OrdersService,
          { provide: OrdersRepository, useValue: ordersRepository },
        ],
      }).compile();
      orders = module.get(OrdersService);
    });

    it('AC2: rechaza el pedido cuando la sucursal está cerrada y no lo registra', async () => {
      ordersRepository.create.mockRejectedValue(
        new ConflictException('La sucursal no acepta pedidos.'),
      );

      await expect(orders.create(customer, input)).rejects.toBeInstanceOf(
        ConflictException,
      );

      expect(ordersRepository.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('controlador HTTP', () => {
    let actor: object;
    let app: INestApplication;

    beforeEach(async () => {
      actor = manager;
      const module = await Test.createTestingModule({
        controllers: [BranchConfigController],
        providers: [
          BranchConfigService,
          { provide: BranchConfigRepository, useValue: repository },
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

    it('AC1: responde 200 con CERRADA al cerrar la sucursal propia', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/branches/${branchA}/config`)
        .send({ isOpen: false })
        .expect(200);

      expect(response.body).toMatchObject({ isOpen: false });
      expect(repository.setIsOpen).toHaveBeenCalledExactlyOnceWith(
        branchA,
        false,
        manager.id,
      );
    });

    it('AC1 (negativo): rechaza un estado que no es booleano', async () => {
      await request(app.getHttpServer())
        .patch(`/branches/${branchA}/config`)
        .send({ isOpen: 'cerrada' })
        .expect(400);

      expect(repository.setIsOpen).not.toHaveBeenCalled();
    });

    it('AC3: responde 403 al gerente de otra sucursal sin modificar el estado', async () => {
      await request(app.getHttpServer())
        .patch(`/branches/${branchB}/config`)
        .send({ isOpen: false })
        .expect(403);

      expect(repository.setIsOpen).not.toHaveBeenCalled();
    });
  });
});
