import { Inject, Injectable } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { Prisma } from '@PrismaClient';
import { PrismaService } from '@Prisma/services';
import { INVENTORY_CONSUMER } from '../ports/index.js';
import type { InventoryConsumer } from '../ports/index.js';
import type {
  CreateTakeoutOrder,
  TakeoutBranch,
  TakeoutDish,
  TakeoutOrder,
  TakeoutOrderLine,
} from '../types/index.js';

const orderInclude = {
  branch: { select: { timeZone: true } },
  items: {
    select: {
      id: true,
      dishId: true,
      dishName: true,
      quantity: true,
      unitPrice: true,
    },
    orderBy: { id: 'asc' },
  },
} as const satisfies Prisma.OrderInclude;

type OrderWithLines = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

@Injectable()
export class TakeoutOrderRepository {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(INVENTORY_CONSUMER) private readonly inventory: InventoryConsumer,
  ) {}

  async findByOperationId(operationId: string): Promise<TakeoutOrder | null> {
    const order = await this.prisma.order.findUnique({
      where: { operationId },
      include: orderInclude,
    });
    return order ? toTakeoutOrder(order) : null;
  }

  async findActiveBranch(branchId: string): Promise<TakeoutBranch | null> {
    return this.prisma.branch.findFirst({
      where: { id: branchId, isActive: true },
      select: { id: true, timeZone: true },
    });
  }

  private async findDishes(
    transaction: Prisma.TransactionClient,
    dishIds: readonly string[],
  ): Promise<TakeoutDish[]> {
    const dishes = await transaction.dish.findMany({
      where: { id: { in: [...dishIds] } },
      select: {
        id: true,
        branchId: true,
        name: true,
        price: true,
        status: true,
        category: { select: { isActive: true } },
      },
    });
    return dishes.map((dish) => ({
      id: dish.id,
      branchId: dish.branchId,
      name: dish.name,
      price: new Decimal(dish.price.toString()),
      status: dish.status,
      categoryActive: dish.category.isActive,
    }));
  }

  async createOrder(
    input: Omit<CreateTakeoutOrder, 'lines'> & { dishIds: string[] },
    validate: (dishes: TakeoutDish[]) => Promise<TakeoutOrderLine[]>,
  ): Promise<{ order: TakeoutOrder; created: boolean }> {
    try {
      const order = await this.prisma.$transaction(async (transaction) => {
        await transaction.$queryRaw(
          Prisma.sql`SELECT id FROM dishes WHERE id IN (${Prisma.join(input.dishIds.map((id) => Prisma.sql`${id}::uuid`))}) ORDER BY id FOR SHARE`,
        );
        const lines = await validate(
          await this.findDishes(transaction, input.dishIds),
        );
        const created = await transaction.order.create({
          data: {
            branchId: input.branchId,
            customerId: input.customerId,
            type: 'TAKEOUT',
            paymentMode: input.paymentMode,
            status: input.status,
            operationId: input.operationId,
            pickupAt: input.pickupAt,
            items: {
              create: lines.map((line) => ({
                dishId: line.dishId,
                dishName: line.name,
                quantity: line.quantity,
                unitPrice: line.unitPrice.toString(),
              })),
            },
          },
          include: orderInclude,
        });
        await this.inventory.consume(created.id, transaction);
        return created;
      });
      return { order: toTakeoutOrder(order), created: true };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.findByOperationId(input.operationId);
        if (existing) return { order: existing, created: false };
      }
      throw error;
    }
  }
}

function toTakeoutOrder(order: OrderWithLines): TakeoutOrder {
  return {
    id: order.id,
    branchId: order.branchId,
    customerId: order.customerId,
    type: order.type,
    paymentMode: order.paymentMode,
    status: order.status,
    pickupAt: order.pickupAt,
    timeZone: order.branch.timeZone,
    lines: order.items.map((item) => ({
      dishId: item.dishId,
      name: item.dishName,
      quantity: item.quantity,
      unitPrice: new Decimal(item.unitPrice.toString()),
    })),
  };
}
