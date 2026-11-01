
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { OrderItem, OrderItemStatus, Prisma } from '@PrismaClient';

export interface CreateOrderItemData {
  orderId: string;
  dishId: string;
  dishName: string;
  quantity: number;
  unitPrice: Prisma.Decimal | number;
  note?: string | null;
  status?: OrderItemStatus;
}

export interface UpdateOrderItemData {
  quantity?: number;
  note?: string | null;
  status?: OrderItemStatus;
}

@Injectable()
export class OrderItemRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: CreateOrderItemData): Promise<OrderItem> {
    return this.prisma.orderItem.create({
      data,
    });
  }

  createMany(data: CreateOrderItemData[]): Promise<{ count: number }> {
    return this.prisma.orderItem.createMany({
      data,
    });
  }

  findById(id: string): Promise<OrderItem | null> {
    return this.prisma.orderItem.findUnique({
      where: { id },
    });
  }

  findByOrder(orderId: string): Promise<OrderItem[]> {
    return this.prisma.orderItem.findMany({
      where: { orderId },
      orderBy: { createdAt: 'asc' },
    });
  }

  findByOrderAndStatus(
    orderId: string,
    status: OrderItemStatus,
  ): Promise<OrderItem[]> {
    return this.prisma.orderItem.findMany({
      where: { orderId, status },
      orderBy: { createdAt: 'asc' },
    });
  }

  findByDish(dishId: string): Promise<OrderItem[]> {
    return this.prisma.orderItem.findMany({
      where: { dishId },
      orderBy: { createdAt: 'desc' },
    });
  }

  update(
    id: string,
    data: UpdateOrderItemData,
  ): Promise<OrderItem> {
    return this.prisma.orderItem.update({
      where: { id },
      data,
    });
  }

  updateStatus(
    id: string,
    status: OrderItemStatus,
  ): Promise<OrderItem> {
    return this.prisma.orderItem.update({
      where: { id },
      data: { status },
    });
  }

  deleteById(id: string): Promise<OrderItem> {
    return this.prisma.orderItem.delete({
      where: { id },
    });
  }

  deleteByOrder(orderId: string): Promise<{ count: number }> {
    return this.prisma.orderItem.deleteMany({
      where: { orderId },
    });
  }
}
