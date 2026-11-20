import { Inject, Injectable } from '@nestjs/common';
import { OrderStatus, PaymentStatus, Prisma } from '@PrismaClient';
import { PrismaService } from '@Prisma/services';

export interface SalesReportQuery {
  branchId: string;
  start: Date;
  end: Date;
}

export interface SalesReportAggregate {
  total: Prisma.Decimal | null;
  paymentsCount: number;
}

@Injectable()
export class SalesReportRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async aggregateApproved(
    query: SalesReportQuery,
  ): Promise<SalesReportAggregate> {
    const aggregate = await this.prisma.payment.aggregate({
      where: {
        branchId: query.branchId,
        status: PaymentStatus.PAID,
        createdAt: { gte: query.start, lt: query.end },
        order: { is: { status: { not: OrderStatus.CANCELED } } },
      },
      _sum: { totalPaid: true },
      _count: { id: true },
    });

    return {
      total: aggregate._sum.totalPaid,
      paymentsCount: aggregate._count.id,
    };
  }
}
