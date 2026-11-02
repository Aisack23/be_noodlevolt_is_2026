import { Inject, Injectable, Logger } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { INGREDIENT_AVAILABILITY_CHECKER } from '@Catalog/menu/ports';
import type { IngredientAvailabilityChecker } from '@Catalog/menu/ports';
import { TakeoutResponseDto } from '../dto/index.js';
import {
  TakeoutBranchInvalidError,
  TakeoutIdempotencyConflictError,
  TakeoutPriceConflictError,
  TakeoutUnavailableError,
} from '../errors/index.js';
import { TakeoutOrderRepository } from '../repositories/index.js';
import type {
  TakeoutDish,
  TakeoutInput,
  TakeoutOrder,
} from '../types/index.js';

const PICKUP_DELAY_MS = 20 * 60 * 1000;

@Injectable()
export class TakeoutOrderService {
  private readonly logger = new Logger(TakeoutOrderService.name);

  constructor(
    @Inject(TakeoutOrderRepository)
    private readonly repository: TakeoutOrderRepository,
    @Inject(INGREDIENT_AVAILABILITY_CHECKER)
    private readonly ingredients: IngredientAvailabilityChecker,
  ) {}

  async create(
    customerId: string,
    operationId: string,
    input: TakeoutInput,
  ): Promise<{ created: boolean; response: TakeoutResponseDto }> {
    const existing = await this.repository.findByOperationId(operationId);
    if (existing) return this.repeat(existing, customerId, input);

    const branch = await this.repository.findActiveBranch(input.branchId);
    if (!branch) throw new TakeoutBranchInvalidError();

    const result = await this.repository.createOrder(
      {
        operationId,
        branchId: input.branchId,
        customerId,
        paymentMode: input.paymentMode,
        status: input.paymentMode === 'ONLINE' ? 'PENDING_PAYMENT' : 'PENDING',
        pickupAt: new Date(Date.now() + PICKUP_DELAY_MS),
        dishIds: [...new Set(input.lines.map((line) => line.dishId))],
      },
      async (dishes) => {
        const byId = new Map(dishes.map((dish) => [dish.id, dish]));
        const unavailable = input.lines
          .filter((line) => {
            const dish = byId.get(line.dishId);
            return (
              !dish ||
              dish.branchId !== input.branchId ||
              dish.status !== 'AVAILABLE' ||
              !dish.categoryActive
            );
          })
          .map((line) => ({
            dishId: line.dishId,
            name: this.visibleName(byId.get(line.dishId), input.branchId),
          }));
        if (unavailable.length)
          throw new TakeoutUnavailableError(uniqueDishes(unavailable));

        let sufficient: ReadonlySet<string>;
        try {
          sufficient = await this.ingredients.findSufficientDishIds(
            input.branchId,
            [...byId.keys()],
          );
        } catch (error) {
          this.logger.warn(
            'No se pudo verificar la disponibilidad del carrito.',
            error,
          );
          throw new TakeoutUnavailableError(
            uniqueDishes(
              input.lines.map((line) => ({
                dishId: line.dishId,
                name: byId.get(line.dishId)?.name ?? null,
              })),
            ),
          );
        }
        const insufficient = input.lines
          .filter((line) => !sufficient.has(line.dishId))
          .map((line) => ({
            dishId: line.dishId,
            name: byId.get(line.dishId)?.name ?? null,
          }));
        if (insufficient.length)
          throw new TakeoutUnavailableError(uniqueDishes(insufficient));

        const changed = input.lines
          .filter(
            (line) => !byId.get(line.dishId)?.price.eq(line.expectedPrice),
          )
          .map((line) => ({
            dishId: line.dishId,
            currentPrice: byId.get(line.dishId)!.price.toFixed(2),
          }));
        if (changed.length)
          throw new TakeoutPriceConflictError(uniquePrices(changed));

        return input.lines.map((line) => ({
          dishId: line.dishId,
          name: byId.get(line.dishId)!.name,
          quantity: line.quantity,
          unitPrice: byId.get(line.dishId)!.price,
        }));
      },
    );
    if (!result.created) return this.repeat(result.order, customerId, input);
    return {
      created: true,
      response: TakeoutResponseDto.fromOrder(result.order),
    };
  }

  private repeat(
    existing: TakeoutOrder,
    customerId: string,
    input: TakeoutInput,
  ): { created: false; response: TakeoutResponseDto } {
    if (!sameRequest(existing, customerId, input))
      throw new TakeoutIdempotencyConflictError();
    return { created: false, response: TakeoutResponseDto.fromOrder(existing) };
  }

  private visibleName(
    dish: TakeoutDish | undefined,
    branchId: string,
  ): string | null {
    return dish?.branchId === branchId ? dish.name : null;
  }
}

function sameRequest(
  existing: TakeoutOrder,
  customerId: string,
  input: TakeoutInput,
): boolean {
  if (
    existing.customerId !== customerId ||
    existing.type !== 'TAKEOUT' ||
    existing.branchId !== input.branchId ||
    existing.paymentMode !== input.paymentMode ||
    existing.lines.length !== input.lines.length
  )
    return false;
  const persisted = existing.lines
    .map(
      (line) => `${line.dishId}:${line.quantity}:${line.unitPrice.toFixed(2)}`,
    )
    .sort();
  const requested = input.lines
    .map(
      (line) =>
        `${line.dishId}:${line.quantity}:${new Decimal(line.expectedPrice).toFixed(2)}`,
    )
    .sort();
  return persisted.every((line, index) => line === requested[index]);
}

function uniqueDishes(
  dishes: { dishId: string; name: string | null }[],
): { dishId: string; name: string | null }[] {
  return [...new Map(dishes.map((dish) => [dish.dishId, dish])).values()];
}

function uniquePrices(
  prices: { dishId: string; currentPrice: string }[],
): { dishId: string; currentPrice: string }[] {
  return [...new Map(prices.map((price) => [price.dishId, price])).values()];
}
