import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import type { Prisma } from '@PrismaClient';

const publicSelect = {
  id: true,
  type: true,
  title: true,
  message: true,
  orderId: true,
  isRead: true,
  createdAt: true,
} as const;

@Injectable()
export class NotificationsRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findOwn(userId: string, page: number, limit: number) {
    const where = { userId };
    const [items, total, unreadCount] = await this.prisma.$transaction(
      [
        this.prisma.notification.findMany({
          where,
          select: publicSelect,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        }),
        this.prisma.notification.count({ where }),
        this.prisma.notification.count({ where: { ...where, isRead: false } }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return {
      items: items.map((item) => ({
        ...item,
        createdAt: item.createdAt.toISOString(),
      })),
      total,
      unreadCount,
      page,
      limit,
    };
  }

  async markOwnAsRead(userId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.notification.updateMany({
        where: { id, userId },
        data: { isRead: true },
      });
      if (updated.count === 0) return null;
      const notification = await tx.notification.findFirstOrThrow({
        where: { id, userId },
        select: publicSelect,
      });
      return {
        ...notification,
        createdAt: notification.createdAt.toISOString(),
      };
    });
  }

  async createOrderReady(
    tx: Prisma.TransactionClient,
    order: {
      id: string;
      customerId: string;
      branch: { name: string };
      orderNumber: string | null;
    },
  ) {
    const eventKey = `PEDIDO_LISTO:${order.id}:${order.customerId}`;
    await tx.notification.createMany({
      data: [
        {
          userId: order.customerId,
          orderId: order.id,
          referenceId: order.id,
          referenceType: 'ORDER',
          eventKey,
          type: 'PEDIDO_LISTO',
          title: 'Tu pedido está listo',
          message: `Tu pedido ${order.orderNumber ?? order.id} está listo para retirar en ${order.branch.name}.`,
        },
      ],
      skipDuplicates: true,
    });
    return tx.notification.findUniqueOrThrow({
      where: { userId_eventKey: { userId: order.customerId, eventKey } },
      select: publicSelect,
    });
  }
}
