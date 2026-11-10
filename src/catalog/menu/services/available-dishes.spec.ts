import { Test } from '@nestjs/testing';
import { NotFoundException, ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import request from 'supertest';
import { DishesController } from '../controllers/dishes.controller.js';
import { BranchNotFoundError } from '../errors/index.js';
import { INGREDIENT_AVAILABILITY_CHECKER } from '../ports/index.js';
import { MenuRepository } from '../repositories/index.js';
import { MenuService } from './menu.service.js';
import type { MenuDish } from '../types/index.js';
import { IS_PUBLIC_KEY } from '../../../auth/decorators/public.decorator.js';

vi.mock('@Prisma/services', () => ({ PrismaService: class {} }));

const branchId = '10000000-0000-4000-8000-000000000001';

function dish(overrides: Partial<MenuDish> = {}): MenuDish {
  return {
    id: '30000000-0000-4000-8000-000000000001',
    name: 'Ramen',
    description: null,
    price: { toFixed: () => '8.50' },
    status: 'AVAILABLE',
    isAvailable: true,
    category: {
      id: '20000000-0000-4000-8000-000000000001',
      name: 'Platos',
      displayOrder: 1,
    },
    ...overrides,
  };
}

describe('BE-01: platillos disponibles', () => {
  const repository = { findByBranchId: vi.fn() };
  const ingredients = { findSufficientDishIds: vi.fn() };
  let app: INestApplication;
  let service: MenuService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [DishesController],
      providers: [
        MenuService,
        { provide: MenuRepository, useValue: repository },
        { provide: INGREDIENT_AVAILABILITY_CHECKER, useValue: ingredients },
      ],
    }).compile();
    service = module.get(MenuService);
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  beforeEach(() => {
    vi.resetAllMocks();
    repository.findByBranchId.mockResolvedValue({
      branch: { id: branchId, name: 'Centro' },
      dishes: [dish()],
    });
    ingredients.findSufficientDishIds.mockResolvedValue(new Set([dish().id]));
  });

  afterAll(async () => {
    await app.close();
  });

  it('declara explícitamente la consulta pública para el guard global', () => {
    expect(
      new Reflector().get(IS_PUBLIC_KEY, DishesController.prototype.list),
    ).toBe(true);
  });

  it('integra HTTP, validación, servicio y serialización decimal sin sesión', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/dishes')
      .query({ branchId, status: 'active' })
      .expect(200);
    expect(response.body).toEqual([
      {
        id: dish().id,
        branchId,
        name: 'Ramen',
        description: null,
        price: '8.50',
        isAvailable: true,
        category: { id: dish().category.id, name: 'Platos' },
      },
    ]);
    expect(repository.findByBranchId).toHaveBeenCalledWith(branchId);
  });

  it('omite status por defecto y conserva branchId en el controlador aislado', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/dishes')
      .set('Authorization', 'Bearer invalid')
      .query({ branchId })
      .expect(200);
    expect(repository.findByBranchId).toHaveBeenCalledExactlyOnceWith(branchId);
  });

  it.each([
    '',
    '?branchId=invalid',
    `?branchId=${branchId}&status=inactive`,
    `?branchId=${branchId}&status=`,
    `?branchId=${branchId}&role=GERENTE`,
    `?branchId=${branchId}&branchId=${branchId}`,
  ])(
    'rechaza parámetros inválidos antes de consultar datos: %s',
    async (query) => {
      await request(app.getHttpServer())
        .get(`/api/v1/dishes${query}`)
        .expect(400);
      expect(repository.findByBranchId).not.toHaveBeenCalled();
    },
  );

  it('devuelve 404 cuando no existe la sucursal', async () => {
    repository.findByBranchId.mockRejectedValue(
      new BranchNotFoundError(branchId),
    );
    await request(app.getHttpServer())
      .get('/api/v1/dishes')
      .query({ branchId })
      .expect(404);
    await expect(service.listAvailableDishes(branchId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('omite no disponibles, agotados y sin insumos, conservando orden por categoría', async () => {
    const dishes = [
      dish(),
      dish({ id: 'unavailable', isAvailable: false }),
      dish({ id: 'sold-out', status: 'SOLD_OUT' }),
      dish({ id: 'insufficient' }),
      dish({
        id: 'drink',
        name: 'Té',
        category: { id: 'drinks', name: 'Bebidas', displayOrder: 2 },
      }),
    ];
    repository.findByBranchId.mockResolvedValue({
      branch: { id: branchId, name: 'Centro' },
      dishes,
    });
    ingredients.findSufficientDishIds.mockResolvedValue(
      new Set(dishes.filter((d) => d.id !== 'insufficient').map((d) => d.id)),
    );
    expect(
      (await service.listAvailableDishes(branchId)).map((d) => d.id),
    ).toEqual([dish().id, 'drink']);
  });

  it('devuelve un arreglo vacío cuando no hay platillos', async () => {
    repository.findByBranchId.mockResolvedValue({
      branch: { id: branchId, name: 'Centro' },
      dishes: [],
    });
    const response = await request(app.getHttpServer())
      .get('/api/v1/dishes')
      .query({ branchId })
      .expect(200);
    expect(response.body).toEqual([]);
  });
});
