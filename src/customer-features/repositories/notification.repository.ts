
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { Notification } from '@PrismaClient';

export interface CreateNotificationData {
  userId: string;
  type: string;
  title: string;
  message: string;
  referenceType?: string | null;
  referenceId?: string | null;
  eventKey?: string | null;
  isRead?: boolean;
}

export interface UpdateNotificationData {
  title?: string;
  message?: string;
  isRead?: boolean;
}

@Injectable()
export class NotificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: CreateNotificationData): Promise<Notification> {
    return this.prisma.notification.create({ data });
  }

  findById(id: string): Promise<Notification | null> {
    return this.prisma.notification.findUnique({
      where: { id },
    });
  }

  findByUser(userId: string): Promise<Notification[]> {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  findUnreadByUser(userId: string): Promise<Notification[]> {
    return this.prisma.notification.findMany({
      where: {
        userId,
        isRead: false,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  countUnreadByUser(userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: {
        userId,
        isRead: false,
      },
    });
  }

  findByReference(
    referenceType: string,
    referenceId: string,
  ): Promise<Notification[]> {
    return this.prisma.notification.findMany({
      where: { referenceType, referenceId },
      orderBy: { createdAt: 'desc' },
    });
  }

  findByEventKey(eventKey: string): Promise<Notification[]> {
    return this.prisma.notification.findMany({
      where: { eventKey },
      orderBy: { createdAt: 'desc' },
    });
  }

  update(
    id: string,
    data: UpdateNotificationData,
  ): Promise<Notification> {
    return this.prisma.notification.update({
      where: { id },
      data,
    });
  }

  markAsRead(id: string): Promise<Notification> {
    return this.prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });
  }

  markAllAsReadByUser(userId: string): Promise<{ count: number }> {
    return this.prisma.notification.updateMany({
      where: {
        userId,
        isRead: false,
      },
      data: { isRead: true },
    });
  }

  deleteById(id: string): Promise<Notification> {
    return this.prisma.notification.delete({
      where: { id },
    });
  }
}
