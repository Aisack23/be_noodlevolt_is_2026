
import { Injectable } from '@nestjs/common';
import { Order, OrderStatus, OrderType } from '@PrismaClient';
import { PrismaService } from '@Prisma/services';

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

@Injectable()
export class OrderRepository {
  constructor(private readonly prisma: PrismaService) {}

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

  findByWaiter(waiterId: string): Promise<Order[]> {
    return this.prisma.order.findMany({
      where: { waiterId },
      orderBy: { createdAt: 'desc' },
    });
  }

  findByStatus(
    branchId: string,
    status: OrderStatus,
  ): Promise<Order[]> {
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

  update(
    id: string,
    data: UpdateOrderData,
  ): Promise<Order> {
    return this.prisma.order.update({
      where: { id },
      data,
    });
  }

  updateStatus(
    id: string,
    status: OrderStatus,
  ): Promise<Order> {
    return this.prisma.order.update({
      where: { id },
      data: { status },
    });
  }
}
