
import { Injectable } from '@nestjs/common';
import { Payment, PaymentStatus } from '@PrismaClient';
import { PrismaService } from '@Prisma/services';
import { Prisma } from '@PrismaClient';

export interface CreatePaymentData {
  branchId: string;
  accountId?: string | null;
  orderId?: string | null;
  fiscalClientId?: string | null;
  subtotal: Prisma.Decimal | number;
  status?: PaymentStatus;
  tip?: Prisma.Decimal | number;
  discount?: Prisma.Decimal | number;
  totalPaid: Prisma.Decimal | number;
  receiptNumber?: string | null;
}

export interface UpdatePaymentData {
  fiscalClientId?: string | null;
  subtotal?: Prisma.Decimal | number;
  status?: PaymentStatus;
  tip?: Prisma.Decimal | number;
  discount?: Prisma.Decimal | number;
  totalPaid?: Prisma.Decimal | number;
  receiptNumber?: string | null;
}

@Injectable()
export class PaymentRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: CreatePaymentData): Promise<Payment> {
    return this.prisma.payment.create({
      data,
    });
  }

  findById(id: string): Promise<Payment | null> {
    return this.prisma.payment.findUnique({
      where: { id },
    });
  }

  findByBranch(branchId: string): Promise<Payment[]> {
    return this.prisma.payment.findMany({
      where: { branchId },
      orderBy: { createdAt: 'desc' },
    });
  }

  findByAccount(accountId: string): Promise<Payment | null> {
    return this.prisma.payment.findUnique({
      where: { accountId },
    });
  }

  findByOrder(orderId: string): Promise<Payment | null> {
    return this.prisma.payment.findUnique({
      where: { orderId },
    });
  }

  findByStatus(
    branchId: string,
    status: PaymentStatus,
  ): Promise<Payment[]> {
    return this.prisma.payment.findMany({
      where: { branchId, status },
      orderBy: { createdAt: 'desc' },
    });
  }

  findByReceiptNumber(receiptNumber: string): Promise<Payment | null> {
    return this.prisma.payment.findUnique({
      where: { receiptNumber },
    });
  }

  findByFiscalClient(fiscalClientId: string): Promise<Payment[]> {
    return this.prisma.payment.findMany({
      where: { fiscalClientId },
      orderBy: { createdAt: 'desc' },
    });
  }

  findByDateRange(
    branchId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<Payment[]> {
    return this.prisma.payment.findMany({
      where: {
        branchId,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  update(
    id: string,
    data: UpdatePaymentData,
  ): Promise<Payment> {
    return this.prisma.payment.update({
      where: { id },
      data,
    });
  }

  updateStatus(
    id: string,
    status: PaymentStatus,
  ): Promise<Payment> {
    return this.prisma.payment.update({
      where: { id },
      data: { status },
    });
  }
}
