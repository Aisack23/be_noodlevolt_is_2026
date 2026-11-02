import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Decimal } from 'decimal.js';
import { INGREDIENT_AVAILABILITY_CHECKER } from '@Catalog/menu/ports';
import {
  TakeoutBranchInvalidError,
  TakeoutIdempotencyConflictError,
  TakeoutUnavailableError,
} from '../errors/index.js';
import { TakeoutOrderRepository } from '../repositories/index.js';
import type {
  CreateTakeoutOrder,
  TakeoutDish,
  TakeoutInput,
  TakeoutOrder,
  TakeoutOrderLine,
} from '../types/index.js';
import { TakeoutOrderService } from './takeout-order.service.js';

describe('TakeoutOrderService', () => {
  const customerId = 'customer';
  const operationId = 'operation';
  const branchId = 'branch';
  const input: TakeoutInput = {
    branchId,
    paymentMode: 'AT_COUNTER',
    lines: [{ dishId: 'ramen', quantity: 2, expectedPrice: '8.50' }],
  };
  const dish: TakeoutDish = {
    id: 'ramen',
    branchId,
    name: 'Ramen',
    price: new Decimal('8.50'),
    status: 'AVAILABLE',
    categoryActive: true,
  };
  const repository = {
    findByOperationId: vi.fn<(key: string) => Promise<TakeoutOrder | null>>(),
    findActiveBranch:
      vi.fn<(id: string) => Promise<{ id: string; timeZone: string } | null>>(),
    findDishes: vi.fn<(ids: readonly string[]) => Promise<TakeoutDish[]>>(),
    createOrder:
      vi.fn<
        (
          data: Omit<CreateTakeoutOrder, 'lines'> & { dishIds: string[] },
          validate: (dishes: TakeoutDish[]) => Promise<TakeoutOrderLine[]>,
        ) => Promise<{ order: TakeoutOrder; created: boolean }>
      >(),
  };
  const ingredients = {
    findSufficientDishIds:
      vi.fn<
        (branch: string, ids: readonly string[]) => Promise<ReadonlySet<string>>
      >(),
  };
  let service: TakeoutOrderService;

  function stored(data: Partial<TakeoutOrder> = {}): TakeoutOrder {
    return {
      id: 'order',
      branchId,
      customerId,
      type: 'TAKEOUT',
      paymentMode: 'AT_COUNTER',
      status: 'PENDING',
      pickupAt: new Date('2026-11-02T18:20:00.000Z'),
      timeZone: 'America/El_Salvador',
      lines: [
        {
          dishId: 'ramen',
          name: 'Ramen',
          quantity: 2,
          unitPrice: new Decimal('8.50'),
        },
      ],
      ...data,
    };
  }

  beforeEach(async () => {
    vi.resetAllMocks();
    vi.spyOn(Date, 'now').mockReturnValue(
      new Date('2026-11-02T18:00:00.000Z').getTime(),
    );
    repository.findByOperationId.mockResolvedValue(null);
    repository.findActiveBranch.mockResolvedValue({
      id: branchId,
      timeZone: 'America/El_Salvador',
    });
    repository.findDishes.mockResolvedValue([dish]);
    repository.createOrder.mockImplementation(async (_data, validate) => {
      const lines = await validate(await repository.findDishes([]));
      return { order: stored({ lines }), created: true };
    });
    ingredients.findSufficientDishIds.mockResolvedValue(new Set(['ramen']));
    const module = await Test.createTestingModule({
      providers: [
        TakeoutOrderService,
        { provide: TakeoutOrderRepository, useValue: repository },
        { provide: INGREDIENT_AVAILABILITY_CHECKER, useValue: ingredients },
      ],
    }).compile();
    service = module.get(TakeoutOrderService);
  });

  afterEach(() => vi.restoreAllMocks());

  it('crea EN_CAJA en PENDIENTE, suma Decimal y fija retiro +20 minutos', async () => {
    const result = await service.create(customerId, operationId, input);
    expect(result.created).toBe(true);
    expect(result.response).toMatchObject({
      id: 'order',
      estado: 'PENDIENTE',
      modalidadPago: 'EN_CAJA',
      total: '17.00',
      horaRetiro: '2026-11-02T12:20:00.000-06:00',
      lineas: [
        { nombre: 'Ramen', cantidad: 2, precio: '8.50', subtotal: '17.00' },
      ],
    });
    expect(repository.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId,
        customerId,
        branchId,
        status: 'PENDING',
        paymentMode: 'AT_COUNTER',
        pickupAt: new Date('2026-11-02T18:20:00.000Z'),
        dishIds: ['ramen'],
      }),
      expect.any(Function),
    );
  });

  it('crea EN_LINEA en PENDIENTE_PAGO', async () => {
    repository.createOrder.mockResolvedValue({
      order: stored({ paymentMode: 'ONLINE', status: 'PENDING_PAYMENT' }),
      created: true,
    });
    const result = await service.create(customerId, operationId, {
      ...input,
      paymentMode: 'ONLINE',
    });
    expect(result.response).toMatchObject({
      estado: 'PENDIENTE_PAGO',
      modalidadPago: 'EN_LINEA',
    });
    expect(repository.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentMode: 'ONLINE',
        status: 'PENDING_PAYMENT',
      }),
      expect.any(Function),
    );
  });

  it('devuelve 200 para la misma clave y contenido sin consultar catálogo', async () => {
    repository.findByOperationId.mockResolvedValue(stored());
    const result = await service.create(customerId, operationId, input);
    expect(result).toMatchObject({ created: false, response: { id: 'order' } });
    expect(repository.findDishes).not.toHaveBeenCalled();
    expect(repository.createOrder).not.toHaveBeenCalled();
  });

  it.each([
    { ...input, paymentMode: 'ONLINE' as const },
    { ...input, lines: [{ ...input.lines[0], quantity: 3 }] },
    { ...input, lines: [{ ...input.lines[0], expectedPrice: '9.00' }] },
  ])('rechaza clave repetida con otro contenido', async (changed) => {
    repository.findByOperationId.mockResolvedValue(stored());
    await expect(
      service.create(customerId, operationId, changed),
    ).rejects.toBeInstanceOf(TakeoutIdempotencyConflictError);
  });

  it('no devuelve a otro cliente un pedido con la misma clave global', async () => {
    repository.findByOperationId.mockResolvedValue(stored());
    await expect(
      service.create('other', operationId, input),
    ).rejects.toBeInstanceOf(TakeoutIdempotencyConflictError);
  });

  it('resuelve la carrera de unicidad con el pedido existente', async () => {
    repository.createOrder.mockResolvedValue({
      order: stored(),
      created: false,
    });
    expect(await service.create(customerId, operationId, input)).toMatchObject({
      created: false,
      response: { id: 'order' },
    });
  });

  it('rechaza sucursal inválida sin crear pedido', async () => {
    repository.findActiveBranch.mockResolvedValue(null);
    await expect(
      service.create(customerId, operationId, input),
    ).rejects.toBeInstanceOf(TakeoutBranchInvalidError);
    expect(repository.createOrder).not.toHaveBeenCalled();
  });

  it.each([
    { label: 'agotado', changed: { status: 'SOLD_OUT' as const } },
    { label: 'deshabilitado', changed: { status: 'DISABLED' as const } },
    { label: 'otra sucursal', changed: { branchId: 'other' } },
    { label: 'categoría inactiva', changed: { categoryActive: false } },
  ])('rechaza platillo $label con su ID', async ({ changed }) => {
    repository.findDishes.mockResolvedValue([{ ...dish, ...changed }]);
    await expect(
      service.create(customerId, operationId, input),
    ).rejects.toMatchObject({
      dishes: [{ dishId: 'ramen' }],
    });
  });

  it('rechaza platillo inexistente', async () => {
    repository.findDishes.mockResolvedValue([]);
    await expect(
      service.create(customerId, operationId, input),
    ).rejects.toBeInstanceOf(TakeoutUnavailableError);
  });

  it('rechaza insumos insuficientes', async () => {
    ingredients.findSufficientDishIds.mockResolvedValue(new Set());
    await expect(
      service.create(customerId, operationId, input),
    ).rejects.toMatchObject({
      dishes: [{ dishId: 'ramen', name: 'Ramen' }],
    });
  });

  it('falla cerrado si el verificador de insumos falla', async () => {
    ingredients.findSufficientDishIds.mockRejectedValue(new Error('E5 caído'));
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});
    await expect(
      service.create(customerId, operationId, input),
    ).rejects.toBeInstanceOf(TakeoutUnavailableError);
    expect(warn).toHaveBeenCalledOnce();
  });

  it('devuelve 409 con precio actual sin crear pedido', async () => {
    repository.findDishes.mockResolvedValue([
      { ...dish, price: new Decimal('9.25') },
    ]);
    await expect(
      service.create(customerId, operationId, input),
    ).rejects.toMatchObject({
      prices: [{ dishId: 'ramen', currentPrice: '9.25' }],
    });
  });

  it('propaga un fallo de consumo y no responde éxito', async () => {
    const failure = new Error('Consumo falló');
    repository.createOrder.mockRejectedValue(failure);
    await expect(service.create(customerId, operationId, input)).rejects.toBe(
      failure,
    );
  });
});
