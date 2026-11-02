
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { OrderStatus, OrderStatusHistory } from '@PrismaClient';

export interface CreateOrderStatusHistoryData {
  orderId: string;
  userId?: string | null;
  previousStatus?: OrderStatus | null;
  newStatus: OrderStatus;
  note?: string | null;
  changedAt?: Date;
}

@Injectable()
export class OrderStatusHistoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(
    data: CreateOrderStatusHistoryData,
  ): Promise<OrderStatusHistory> {
    return this.prisma.orderStatusHistory.create({
      data,
    });
  }

  findById(id: string): Promise<OrderStatusHistory | null> {
    return this.prisma.orderStatusHistory.findUnique({
      where: { id },
    });
  }

  findByOrder(orderId: string): Promise<OrderStatusHistory[]> {
    return this.prisma.orderStatusHistory.findMany({
      where: { orderId },
      orderBy: { changedAt: 'asc' },
    });
  }

  findByUser(userId: string): Promise<OrderStatusHistory[]> {
    return this.prisma.orderStatusHistory.findMany({
      where: { userId },
      orderBy: { changedAt: 'desc' },
    });
  }

  findByNewStatus(
    orderId: string,
    newStatus: OrderStatus,
  ): Promise<OrderStatusHistory[]> {
    return this.prisma.orderStatusHistory.findMany({
      where: { orderId, newStatus },
      orderBy: { changedAt: 'desc' },
    });
  }

  findByDateRange(
    orderId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<OrderStatusHistory[]> {
    return this.prisma.orderStatusHistory.findMany({
      where: {
        orderId,
        changedAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: { changedAt: 'asc' },
    });
  }
}
