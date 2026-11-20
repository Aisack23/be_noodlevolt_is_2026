
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { Redemption, RedemptionStatus } from '@PrismaClient';

export interface CreateRedemptionData {
  customerId: string;
  benefitId: string;
  code: string;
  pointsCost: number;
  status?: RedemptionStatus;
  usedAt?: Date | null;
}

export interface UpdateRedemptionData {
  status?: RedemptionStatus;
  usedAt?: Date | null;
}

@Injectable()
export class RedemptionRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: CreateRedemptionData): Promise<Redemption> {
    return this.prisma.redemption.create({ data });
  }

  findById(id: string): Promise<Redemption | null> {
    return this.prisma.redemption.findUnique({
      where: { id },
    });
  }

  findByCode(code: string): Promise<Redemption | null> {
    return this.prisma.redemption.findUnique({
      where: { code },
    });
  }

  findByCustomer(customerId: string): Promise<Redemption[]> {
    return this.prisma.redemption.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
    });
  }

  findByBenefit(benefitId: string): Promise<Redemption[]> {
    return this.prisma.redemption.findMany({
      where: { benefitId },
      orderBy: { createdAt: 'desc' },
    });
  }

  findByCustomerAndStatus(
    customerId: string,
    status: RedemptionStatus,
  ): Promise<Redemption[]> {
    return this.prisma.redemption.findMany({
      where: { customerId, status },
      orderBy: { createdAt: 'desc' },
    });
  }

  update(
    id: string,
    data: UpdateRedemptionData,
  ): Promise<Redemption> {
    return this.prisma.redemption.update({
      where: { id },
      data,
    });
  }

  updateStatus(
    id: string,
    status: RedemptionStatus,
  ): Promise<Redemption> {
    return this.prisma.redemption.update({
      where: { id },
      data: { status },
    });
  }
}
