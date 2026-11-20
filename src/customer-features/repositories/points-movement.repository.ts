
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import {
  PointsMovement,
  PointsMovementType,
} from '@PrismaClient';

export interface CreatePointsMovementData {
  customerId: string;
  pointsRuleId?: string | null;
  type: PointsMovementType;
  points: number;
  paymentId?: string | null;
  redemptionId?: string | null;
}

@Injectable()
export class PointsMovementRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: CreatePointsMovementData): Promise<PointsMovement> {
    return this.prisma.pointsMovement.create({ data });
  }

  findById(id: string): Promise<PointsMovement | null> {
    return this.prisma.pointsMovement.findUnique({
      where: { id },
    });
  }

  findByCustomer(customerId: string): Promise<PointsMovement[]> {
    return this.prisma.pointsMovement.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
    });
  }

  findByPayment(paymentId: string): Promise<PointsMovement | null> {
    return this.prisma.pointsMovement.findFirst({
      where: { paymentId, type: 'EARN' },
    });
  }

  findByRedemption(redemptionId: string): Promise<PointsMovement | null> {
    return this.prisma.pointsMovement.findUnique({
      where: { redemptionId },
    });
  }

  findByCustomerAndType(
    customerId: string,
    type: PointsMovementType,
  ): Promise<PointsMovement[]> {
    return this.prisma.pointsMovement.findMany({
      where: { customerId, type },
      orderBy: { createdAt: 'desc' },
    });
  }

  findByCustomerAndDateRange(
    customerId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<PointsMovement[]> {
    return this.prisma.pointsMovement.findMany({
      where: {
        customerId,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  getCustomerBalance(customerId: string): Promise<number> {
    return this.prisma.pointsMovement.aggregate({
      where: { customerId },
      _sum: { points: true },
    }).then((result) => result._sum.points ?? 0);
  }
}
