import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { Prisma } from '@PrismaClient';
import { calculatePoints } from '../domain/index.js';
import { LoyaltyAccrualError } from '../errors/loyalty-accrual.error.js';

@Injectable()
export class LoyaltyRepository {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async getBalance(userId: string): Promise<number> {
    const account = await this.prisma.loyaltyAccount.findUnique({
      where: { userId },
      select: { points: true },
    });
    return account?.points ?? 0;
  }

  async accruePayment(
    paymentId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    try {
      if (!tx) {
        await this.prisma.$transaction((client) =>
          this.accruePayment(paymentId, client),
        );
        return;
      }
      const payment = await tx.payment.findUnique({
        where: { id: paymentId },
        select: {
          status: true,
          totalPaid: true,
          branchId: true,
          order: {
            select: {
              customerId: true,
              status: true,
              branchId: true,
              customer: { select: { role: true } },
            },
          },
        },
      });
      if (!payment) return;
      const points = calculatePoints(payment);
      const customerId = payment.order?.customerId;
      if (!points || !customerId) return;

      // El conflicto del índice parcial es un reintento válido. La transacción
      // solo modifica el saldo si adquirió la acreditación de este paymentId.
      const inserted = await tx.$executeRaw`
        INSERT INTO points_movements (id,customer_id,type,points,payment_id)
        VALUES (${randomUUID()}::uuid,${customerId}::uuid,'EARN',${points}::integer,${paymentId}::uuid)
        ON CONFLICT (payment_id) WHERE type = 'EARN' DO NOTHING
      `;
      if (inserted === 1) {
        await tx.loyaltyAccount.upsert({
          where: { userId: customerId },
          create: { userId: customerId, points },
          update: { points: { increment: points } },
        });
      }
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        throw new LoyaltyAccrualError({ cause: error });
      }
      throw error;
    }
  }
}
