
import { Injectable } from '@nestjs/common';
import { PaymentDetail, PaymentMethod } from '@PrismaClient';
import { PrismaService } from '@Prisma/services';
import { Prisma } from '@PrismaClient';

export interface CreatePaymentDetailData {
  paymentId: string;
  method: PaymentMethod;
  amount: Prisma.Decimal | number;
  reference?: string | null;
  cashTendered?: Prisma.Decimal | number | null;
  changeAmount?: Prisma.Decimal | number | null;
}

export interface UpdatePaymentDetailData {
  method?: PaymentMethod;
  amount?: Prisma.Decimal | number;
  reference?: string | null;
  cashTendered?: Prisma.Decimal | number | null;
  changeAmount?: Prisma.Decimal | number | null;
}

@Injectable()
export class PaymentDetailRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: CreatePaymentDetailData): Promise<PaymentDetail> {
    return this.prisma.paymentDetail.create({
      data,
    });
  }

  findById(id: string): Promise<PaymentDetail | null> {
    return this.prisma.paymentDetail.findUnique({
      where: { id },
    });
  }

  findByPayment(paymentId: string): Promise<PaymentDetail[]> {
    return this.prisma.paymentDetail.findMany({
      where: { paymentId },
      orderBy: { method: 'asc' },
    });
  }

  findByMethod(method: PaymentMethod): Promise<PaymentDetail[]> {
    return this.prisma.paymentDetail.findMany({
      where: { method },
    });
  }

  update(
    id: string,
    data: UpdatePaymentDetailData,
  ): Promise<PaymentDetail> {
    return this.prisma.paymentDetail.update({
      where: { id },
      data,
    });
  }

  deleteById(id: string): Promise<PaymentDetail> {
    return this.prisma.paymentDetail.delete({
      where: { id },
    });
  }

  deleteByPayment(paymentId: string): Promise<{ count: number }> {
    return this.prisma.paymentDetail.deleteMany({
      where: { paymentId },
    });
  }
}
