import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { Prisma } from '@PrismaClient';
import type { CardDecision } from '../services/test-card-gateway.js';
import type { PaymentResultDto } from '../dto/payment-result.dto.js';

const payableSelect = { customerId: true, status: true } as const;

@Injectable()
export class SimulatedPaymentsRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async requirePayable(orderId: string, customerId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: payableSelect,
    });
    assertOwner(order, customerId);
    const approved = await this.prisma.payment.findFirst({
      where: { orderId, status: 'PAID' },
      select: { id: true },
    });
    if (approved)
      throw new ConflictException('El pedido ya tiene un pago aprobado.');
  }

  record(
    orderId: string,
    customerId: string,
    decision: CardDecision,
  ): Promise<PaymentResultDto> {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM orders WHERE id=${orderId}::uuid FOR UPDATE`,
        );
        const order = await tx.order.findUnique({
          where: { id: orderId },
          select: {
            ...payableSelect,
            branchId: true,
            items: { select: { unitPrice: true, quantity: true } },
          },
        });
        assertOwner(order, customerId);
        const approved = await tx.payment.findFirst({
          where: { orderId, status: 'PAID' },
          select: { id: true },
        });
        if (approved)
          throw new ConflictException('El pedido ya tiene un pago aprobado.');
        if (!order.items.length)
          throw new ConflictException('El pedido no tiene líneas para cobrar.');
        const amount = order.items.reduce(
          (sum, item) => sum.add(item.unitPrice.mul(item.quantity)),
          new Prisma.Decimal(0),
        );
        if (amount.lte(0))
          throw new ConflictException('El importe del pedido no es válido.');
        const receiptNumber = decision.approved ? `NV-${randomUUID()}` : null;
        const payment = await tx.payment.create({
          data: {
            orderId,
            branchId: order.branchId,
            subtotal: amount,
            totalPaid: decision.approved ? amount : new Prisma.Decimal(0),
            status: decision.approved ? 'PAID' : 'REJECTED',
            last4: decision.last4,
            rejectionReason: decision.reason,
            receiptNumber,
            simpleReceipt: decision.approved
              ? { create: { number: receiptNumber!, amount } }
              : undefined,
          },
          include: { simpleReceipt: true },
        });
        return {
          id: payment.id,
          orderId,
          status: decision.approved ? 'APROBADO' : 'RECHAZADO',
          amount: payment.subtotal.toFixed(2),
          last4: decision.last4,
          reason: payment.rejectionReason,
          receipt: payment.simpleReceipt
            ? {
                id: payment.simpleReceipt.id,
                number: payment.simpleReceipt.number,
                amount: payment.simpleReceipt.amount.toFixed(2),
                issuedAt: payment.simpleReceipt.issuedAt.toISOString(),
              }
            : null,
        };
      },
      { timeout: 10000 },
    );
  }
}

function assertOwner<T extends { customerId: string | null; status: string }>(
  order: T | null,
  customerId: string,
): asserts order is T {
  if (!order) throw new NotFoundException('El pedido no existe.');
  if (order.customerId !== customerId)
    throw new ForbiddenException('El pedido no pertenece al cliente.');
  if (order.status === 'CANCELED')
    throw new ConflictException('El pedido está cancelado.');
}
