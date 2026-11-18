import { Inject, Injectable } from '@nestjs/common';
import { OrderStatus, PaymentStatus } from '@PrismaClient';
import { PrismaService } from '@Prisma/services';

export interface TopDishesQuery {
  branchId: string;
  start: Date;
  end: Date;
}

export interface TopDishQuantity {
  dishId: string;
  dishName: string;
  quantity: number;
}

@Injectable()
export class TopDishesRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findSoldItems(query: TopDishesQuery): Promise<TopDishQuantity[]> {
    const items = await this.prisma.orderItem.findMany({
      where: {
        order: {
          is: {
            branchId: query.branchId,
            status: { not: OrderStatus.CANCELED },
            payments: {
              some: {
                branchId: query.branchId,
                status: PaymentStatus.PAID,
                createdAt: { gte: query.start, lt: query.end },
              },
            },
          },
        },
      },
      select: { dishId: true, dishName: true, quantity: true },
    });

    const totals = new Map<string, TopDishQuantity>();
    for (const item of items) {
      const current = totals.get(item.dishId);
      if (current) {
        current.quantity += item.quantity;
      } else {
        totals.set(item.dishId, {
          dishId: item.dishId,
          dishName: item.dishName,
          quantity: item.quantity,
        });
      }
    }

    return Array.from(totals.values()).sort((a, b) => {
      if (b.quantity !== a.quantity) return b.quantity - a.quantity;
      return a.dishName.localeCompare(b.dishName, 'es');
    });
  }
}

