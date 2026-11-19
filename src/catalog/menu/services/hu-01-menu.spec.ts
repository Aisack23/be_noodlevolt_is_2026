import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@PrismaClient';
import type { PrismaService } from '@Prisma/services';
import { BranchNotFoundError } from '../errors/index.js';
import { INGREDIENT_AVAILABILITY_CHECKER } from '../ports/index.js';
import { MenuRepository } from '../repositories/index.js';
import type { BranchMenu, MenuDish } from '../types/index.js';
import { MenuService } from './menu.service.js';

describe('HU-01. Consultar menú disponible', () => {
  const branch = { id: '10000000-0000-4000-8000-000000000001', name: 'Centro' };
  const repository = {
    findByBranchId: vi.fn<(branchId: string) => Promise<BranchMenu>>(),
  };
  const ingredients = {
    findSufficientDishIds:
      vi.fn<
        (
          branchId: string,
          dishIds: readonly string[],
        ) => Promise<ReadonlySet<string>>
      >(),
  };
  let service: MenuService;

  function dish(overrides: Partial<MenuDish> = {}): MenuDish {
    return {
      id: 'ramen',
      name: 'Ramen',
      description: null,
      price: new Prisma.Decimal('8.5'),
      status: 'AVAILABLE',
      isAvailable: true,
      category: { id: 'main', name: 'Platos fuertes', displayOrder: 1 },
      ...overrides,
    };
  }

  beforeEach(async () => {
    vi.resetAllMocks();
    repository.findByBranchId.mockResolvedValue({ branch, dishes: [dish()] });
    ingredients.findSufficientDishIds.mockResolvedValue(new Set(['ramen']));
    const module = await Test.createTestingModule({
      providers: [
        MenuService,
        { provide: MenuRepository, useValue: repository },
        { provide: INGREDIENT_AVAILABILITY_CHECKER, useValue: ingredients },
      ],
    }).compile();
    service = module.get(MenuService);
  });

  it('AC1: muestra los platillos con precio y categoría', async () => {
    const menu = await service.getMenu(branch.id);

    expect(menu.categorias).toEqual([
      {
        id: 'main',
        nombre: 'Platos fuertes',
        platillos: [
          {
            id: 'ramen',
            nombre: 'Ramen',
            descripcion: null,
            precio: '8.50',
            disponible: true,
          },
        ],
      },
    ]);
    expect(repository.findByBranchId).toHaveBeenCalledExactlyOnceWith(
      branch.id,
    );
  });

  it('AC2: el repositorio excluye los platillos DISABLED de la consulta', async () => {
    const prisma = {
      branch: {
        findFirst: vi.fn().mockResolvedValue({ id: branch.id, name: 'Centro' }),
      },
      dish: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const menuRepository = new MenuRepository(
      prisma as unknown as PrismaService,
    );

    await menuRepository.findByBranchId(branch.id);

    expect(prisma.dish.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: { not: 'DISABLED' } }),
      }),
    );
  });

  it('AC3: informa el fallo del servidor sin devolver un menú inventado', async () => {
    repository.findByBranchId.mockRejectedValue(
      new Error('Connection refused'),
    );

    await expect(service.getMenu(branch.id)).rejects.toThrow(
      'Connection refused',
    );
  });

  it('AC3 (negativo): una sucursal inexistente responde 404 y no devuelve platillos', async () => {
    repository.findByBranchId.mockRejectedValue(
      new BranchNotFoundError(branch.id),
    );

    await expect(service.getMenu(branch.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
