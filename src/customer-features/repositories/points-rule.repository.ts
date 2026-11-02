
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { PointsRule, Prisma } from '@PrismaClient';

export interface CreatePointsRuleData {
  pointsPerDollar: Prisma.Decimal | number;
  isActive?: boolean;
  startsAt?: Date;
  endsAt?: Date | null;
}

export interface UpdatePointsRuleData {
  pointsPerDollar?: Prisma.Decimal | number;
  isActive?: boolean;
  startsAt?: Date;
  endsAt?: Date | null;
}

@Injectable()
export class PointsRuleRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: CreatePointsRuleData): Promise<PointsRule> {
    return this.prisma.pointsRule.create({ data });
  }

  findById(id: string): Promise<PointsRule | null> {
    return this.prisma.pointsRule.findUnique({
      where: { id },
    });
  }

  findAll(): Promise<PointsRule[]> {
    return this.prisma.pointsRule.findMany({
      orderBy: { startsAt: 'desc' },
    });
  }

  findActive(): Promise<PointsRule[]> {
    const now = new Date();

    return this.prisma.pointsRule.findMany({
      where: {
        isActive: true,
        startsAt: { lte: now },
        OR: [
          { endsAt: null },
          { endsAt: { gte: now } },
        ],
      },
      orderBy: { startsAt: 'desc' },
    });
  }

  update(
    id: string,
    data: UpdatePointsRuleData,
  ): Promise<PointsRule> {
    return this.prisma.pointsRule.update({
      where: { id },
      data,
    });
  }

  setActive(id: string, isActive: boolean): Promise<PointsRule> {
    return this.prisma.pointsRule.update({
      where: { id },
      data: { isActive },
    });
  }
}
