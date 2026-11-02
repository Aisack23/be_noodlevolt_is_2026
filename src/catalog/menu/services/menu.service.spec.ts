import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@PrismaClient';
import { BranchNotFoundError } from '../errors/index.js';
import { INGREDIENT_AVAILABILITY_CHECKER } from '../ports/index.js';
import { MenuRepository } from '../repositories/index.js';
import type { BranchMenu, MenuDish } from '../types/index.js';
import { MenuService } from './menu.service.js';

describe('MenuService', () => {
  const branch = { id: 'branch', name: 'Centro' };
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
      category: { id: 'main', name: 'Platos fuertes', displayOrder: 2 },
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

  it('mapea claves y conserva precio decimal con dos posiciones', async () => {
    expect(await service.getMenu(branch.id)).toEqual({
      sucursal: { id: branch.id, nombre: 'Centro' },
      categorias: [
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
      ],
    });
  });
  it.each([
    ['0.01', '0.01'],
    ['8', '8.00'],
    ['999999.99', '999999.99'],
  ])(
    'formatea el precio %s sin pérdida de precisión',
    async (price, expected) => {
      repository.findByBranchId.mockResolvedValue({
        branch,
        dishes: [dish({ price: new Prisma.Decimal(price) })],
      });
      const result = await service.getMenu(branch.id);
      expect(result.categorias[0].platillos[0].precio).toBe(expected);
    },
  );
  it('excluye deshabilitados y categorías que solo los contienen', async () => {
    repository.findByBranchId.mockResolvedValue({
      branch,
      dishes: [
        dish(),
        dish({
          id: 'hidden',
          status: 'DISABLED',
          category: { id: 'hidden-category', name: 'Oculta', displayOrder: 4 },
        }),
      ],
    });
    const result = await service.getMenu(branch.id);
    expect(result.categorias).toHaveLength(1);
    expect(result.categorias[0].platillos).toHaveLength(1);
    expect(ingredients.findSufficientDishIds).toHaveBeenCalledExactlyOnceWith(
      branch.id,
      ['ramen'],
    );
  });
  it('mantiene el agotado con disponible falso aunque tenga insumos', async () => {
    repository.findByBranchId.mockResolvedValue({
      branch,
      dishes: [dish({ status: 'SOLD_OUT' })],
    });
    expect(
      (await service.getMenu(branch.id)).categorias[0].platillos[0].disponible,
    ).toBe(false);
  });
  it('marca disponible falso cuando faltan insumos', async () => {
    ingredients.findSufficientDishIds.mockResolvedValue(new Set());
    expect(
      (await service.getMenu(branch.id)).categorias[0].platillos[0].disponible,
    ).toBe(false);
  });
  it('verifica todos los platillos visibles en una sola llamada', async () => {
    repository.findByBranchId.mockResolvedValue({
      branch,
      dishes: [dish(), dish({ id: 'tea', name: 'Té' })],
    });
    await service.getMenu(branch.id);
    expect(ingredients.findSufficientDishIds).toHaveBeenCalledExactlyOnceWith(
      branch.id,
      ['ramen', 'tea'],
    );
  });
  it('prioriza displayOrder y ordena platillos por nombre sin mutar los datos leídos', async () => {
    const dishes = [
      dish({
        id: 'z',
        name: 'Zumo',
        category: { id: 'drinks', name: 'Bebidas', displayOrder: 3 },
      }),
      dish(),
      dish({
        id: 'a',
        name: 'Agua',
        category: { id: 'drinks', name: 'Bebidas', displayOrder: 3 },
      }),
    ];
    repository.findByBranchId.mockResolvedValue({ branch, dishes });
    const result = await service.getMenu(branch.id);
    expect(result.categorias.map((category) => category.nombre)).toEqual([
      'Platos fuertes',
      'Bebidas',
    ]);
    expect(result.categorias[1].platillos.map((item) => item.nombre)).toEqual([
      'Agua',
      'Zumo',
    ]);
    expect(dishes.map((item) => item.id)).toEqual(['z', 'ramen', 'a']);
  });
  it('desempata categorías de igual orden por nombre y luego por id', async () => {
    repository.findByBranchId.mockResolvedValue({
      branch,
      dishes: [
        dish({
          id: 'one',
          category: { id: 'b', name: 'Entradas', displayOrder: 1 },
        }),
        dish({
          id: 'two',
          category: { id: 'a', name: 'Entradas', displayOrder: 1 },
        }),
        dish({
          id: 'three',
          category: { id: 'z', name: 'Bebidas', displayOrder: 1 },
        }),
      ],
    });
    const result = await service.getMenu(branch.id);
    expect(result.categorias.map((category) => category.id)).toEqual([
      'z',
      'a',
      'b',
    ]);
  });
  it('devuelve categorías vacías para una sucursal sin platillos visibles', async () => {
    repository.findByBranchId.mockResolvedValue({ branch, dishes: [] });
    expect((await service.getMenu(branch.id)).categorias).toEqual([]);
  });
  it('traduce sucursal inexistente a 404 sin verificar insumos', async () => {
    repository.findByBranchId.mockRejectedValue(
      new BranchNotFoundError(branch.id),
    );
    await expect(service.getMenu(branch.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(ingredients.findSufficientDishIds).not.toHaveBeenCalled();
  });
  it('no transforma un fallo del verificador en disponibilidad positiva', async () => {
    const failure = new Error('Verificador no disponible');
    ingredients.findSufficientDishIds.mockRejectedValue(failure);
    await expect(service.getMenu(branch.id)).rejects.toBe(failure);
  });
});
