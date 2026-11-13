import {
  ForbiddenException,
  NotFoundException,
  Inject,
  Injectable,
} from '@nestjs/common';
import type { Prisma } from '@PrismaClient';
import { NotificationsRepository } from '../repositories/notifications.repository.js';

@Injectable()
export class NotificationsService {
  constructor(
    @Inject(NotificationsRepository)
    private readonly repository: NotificationsRepository,
  ) {}

  listOwn(actor: { id: string; role: string }, page: number, limit: number) {
    if (actor.role !== 'CLIENT')
      throw new ForbiddenException(
        'Solo los clientes pueden consultar sus notificaciones.',
      );
    return this.repository.findOwn(actor.id, page, limit);
  }

  async markOwnAsRead(actor: { id: string; role: string }, id: string) {
    if (actor.role !== 'CLIENT')
      throw new ForbiddenException(
        'Solo los clientes pueden gestionar sus notificaciones.',
      );
    const notification = await this.repository.markOwnAsRead(actor.id, id);
    if (!notification)
      throw new NotFoundException('La notificación no existe.');
    return notification;
  }

  async notifyOrderReady(orderId: string, tx: Prisma.TransactionClient) {
    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      select: {
        id: true,
        customerId: true,
        status: true,
        orderNumber: true,
        branch: { select: { name: true } },
      },
    });
    if (order.status !== 'READY')
      throw new Error('El aviso requiere un pedido READY.');
    if (!order.customerId) return null;
    return this.repository.createOrderReady(tx, {
      ...order,
      customerId: order.customerId,
    });
  }
}
