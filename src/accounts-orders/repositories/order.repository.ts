import { OrderReadyNotifier } from '@AccountsOrders/ports';
import {
  KitchenOrderIntegrityError,
  KitchenOrderNotFoundError,
  KitchenOrderTransitionError,
} from '@AccountsOrders/errors';
import { Inject, Injectable } from '@nestjs/common';
import {
  Order,
  OrderItemStatus,
  OrderStatus,
  OrderType,
  Prisma,
} from '@PrismaClient';
import { PrismaService } from '@Prisma/services';

export interface CustomerOrderListRow {
  id: string;
  orderNumber: string | null;
  status: OrderStatus;
  total: unknown;
  createdAt: Date;
  branchId: string;
  branch: {
    name: string;
  };
  review: { id: string; rating: number } | null;
}

export interface CreateOrderData {
  branchId: string;
  accountId?: string | null;
  customerId?: string | null;
  waiterId?: string | null;
  orderNumber?: string | null;
  type: OrderType;
  recipientName?: string | null;
  recipientPhone?: string | null;
  deliveryAddress?: string | null;
  deliveryReference?: string | null;
  deliveryInstructions?: string | null;
  status?: OrderStatus;
  operationId?: string;
  pickupAt?: Date | null;
}

export interface UpdateOrderData {
  accountId?: string | null;
  customerId?: string | null;
  waiterId?: string | null;
  orderNumber?: string | null;
  recipientName?: string | null;
  recipientPhone?: string | null;
  deliveryAddress?: string | null;
  deliveryReference?: string | null;
  deliveryInstructions?: string | null;
  pickupAt?: Date | null;
}

export interface KitchenOrderRow {
  id: string;
  branchId: string;
  orderNumber: string | null;
  type: OrderType;
  status: OrderStatus;
  createdAt: Date;
  items: {
    id: string;
    dishName: string;
    quantity: number;
    note: string | null;
    status: OrderItemStatus;
  }[];
}

@Injectable()
export class OrderRepository {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(OrderReadyNotifier)
    private readonly orderReadyNotifier: OrderReadyNotifier,
  ) {}

  create(data: CreateOrderData): Promise<Order> {
    return this.prisma.order.create({
      data,
    });
  }

  findById(id: string): Promise<Order | null> {
    return this.prisma.order.findUnique({
      where: { id },
    });
  }

  findByOperationId(operationId: string): Promise<Order | null> {
    return this.prisma.order.findUnique({
      where: { operationId },
    });
  }

  findByBranch(branchId: string): Promise<Order[]> {
    return this.prisma.order.findMany({
      where: { branchId },
      orderBy: { createdAt: 'desc' },
    });
  }

  findByAccount(accountId: string): Promise<Order[]> {
    return this.prisma.order.findMany({
      where: { accountId },
      orderBy: { createdAt: 'desc' },
    });
  }

  findByCustomer(customerId: string): Promise<Order[]> {
    return this.prisma.order.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
    });
  }

  findMine(
    customerId: string,
    status?: OrderStatus,
    limit = 50,
  ): Promise<CustomerOrderListRow[]> {
    return this.prisma.order.findMany({
      where: {
        customerId,
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        total: true,
        createdAt: true,
        branchId: true,
        branch: {
          select: {
            name: true,
          },
        },
        review: {
          select: {
            id: true,
            rating: true,
          },
        },
      },
    }) as Promise<CustomerOrderListRow[]>;
  }

  findByWaiter(waiterId: string): Promise<Order[]> {
    return this.prisma.order.findMany({
      where: { waiterId },
      orderBy: { createdAt: 'desc' },
    });
  }

  findByStatus(branchId: string, status: OrderStatus): Promise<Order[]> {
    return this.prisma.order.findMany({
      where: { branchId, status },
      orderBy: { createdAt: 'desc' },
    });
  }

  findByBranchAndDateRange(
    branchId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<Order[]> {
    return this.prisma.order.findMany({
      where: {
        branchId,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  update(id: string, data: UpdateOrderData): Promise<Order> {
    return this.prisma.order.update({
      where: { id },
      data,
    });
  }

  updateStatus(id: string, status: OrderStatus): Promise<Order> {
    return this.prisma.order.update({
      where: { id },
      data: { status },
    });
  }

  findKitchenQueue(branchId: string): Promise<KitchenOrderRow[]> {
    return this.prisma.order.findMany({
      where: {
        branchId,
        status: {
          in: [OrderStatus.PENDING, OrderStatus.IN_PREPARATION],
        },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: kitchenOrderSelect,
    });
  }

  async findReadyQueue(branchId: string): Promise<KitchenOrderRow[]> {
    const orders = await this.prisma.order.findMany({
      where: { branchId, status: OrderStatus.READY },
      select: {
        ...kitchenOrderSelect,
        statusHistory: {
          where: { newStatus: OrderStatus.READY },
          orderBy: { changedAt: 'desc' },
          take: 1,
          select: { changedAt: true },
        },
      },
    });
    // Pedidos históricos pueden no tener una entrada de llegada a LISTO.
    return orders.sort(
      (a, b) =>
        (a.statusHistory[0]?.changedAt ?? a.createdAt).getTime() -
          (b.statusHistory[0]?.changedAt ?? b.createdAt).getTime() ||
        a.id.localeCompare(b.id),
    );
  }

  async transitionKitchenStatus(
    branchId: string,
    orderId: string,
    userId: string,
    nextStatus: 'IN_PREPARATION' | 'READY' | 'DELIVERED',
  ): Promise<KitchenOrderRow> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Bloquear antes de validar impide dos historiales para un mismo avance.
        const locked = await tx.$queryRaw<
          { id: string; status: OrderStatus }[]
        >(
          Prisma.sql`SELECT id, status FROM orders WHERE id=${orderId}::uuid AND branch_id=${branchId}::uuid FOR UPDATE`,
        );
        if (!locked[0]) throw new KitchenOrderNotFoundError();
        const currentStatus = locked[0].status;
        if (currentStatus === nextStatus) {
          return tx.order.findUniqueOrThrow({
            where: { id: orderId },
            select: kitchenOrderSelect,
          });
        }
        if (!isKitchenTransition(currentStatus, nextStatus)) {
          throw new KitchenOrderTransitionError(currentStatus, nextStatus);
        }
        await tx.order.update({
          where: { id: orderId },
          data: { status: nextStatus, updatedBy: userId },
        });
        await tx.orderItem.updateMany({
          where: {
            orderId,
            status: {
              in: [
                OrderItemStatus.PENDING,
                OrderItemStatus.IN_PREPARATION,
                ...(nextStatus === OrderStatus.DELIVERED
                  ? [OrderItemStatus.READY]
                  : []),
              ],
            },
          },
          data: { status: nextStatus },
        });
        await tx.orderStatusHistory.create({
          data: {
            orderId,
            userId,
            previousStatus: currentStatus,
            newStatus: nextStatus,
          },
        });
        if (nextStatus === OrderStatus.READY) {
          await this.orderReadyNotifier.notifyOrderReady(orderId, tx);
        }
        return tx.order.findUniqueOrThrow({
          where: { id: orderId },
          select: kitchenOrderSelect,
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') throw new KitchenOrderNotFoundError();
        if (error.code === 'P2002' || error.code === 'P2003')
          throw new KitchenOrderIntegrityError();
      }
      throw error;
    }
  }
}

const kitchenOrderSelect = {
  id: true,
  branchId: true,
  orderNumber: true,
  type: true,
  status: true,
  createdAt: true,
  items: {
    select: {
      id: true,
      dishName: true,
      quantity: true,
      note: true,
      status: true,
    },
    orderBy: { createdAt: 'asc' },
  },
} as const satisfies Prisma.OrderSelect;

function isKitchenTransition(
  current: OrderStatus,
  next: 'IN_PREPARATION' | 'READY' | 'DELIVERED',
): boolean {
  return (
    (current === OrderStatus.PENDING && next === OrderStatus.IN_PREPARATION) ||
    (current === OrderStatus.IN_PREPARATION && next === OrderStatus.READY) ||
    (current === OrderStatus.READY && next === OrderStatus.DELIVERED)
  );
}
