import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { type User, UserRole } from '@PrismaClient';
import {
  OrderRepository,
  type CustomerOrderListRow,
} from '@AccountsOrders/repositories';
import type { MyOrderResponseDto } from '../dto/my-order-response.dto.js';
import type { MyOrdersQueryDto } from '../dto/my-orders-query.dto.js';

function onlinePaymentStatus(
  row: CustomerOrderListRow,
): MyOrderResponseDto['paymentStatus'] {
  if (row.type !== 'TAKEOUT' || row.paymentMode === 'AT_COUNTER') return null;
  const payment = row.payments[0]?.status;
  if (payment === 'PAID' || payment === 'REJECTED') return payment;
  return row.paymentMode === 'ONLINE' || row.status === 'PENDING_PAYMENT'
    ? 'PENDING'
    : null;
}

@Injectable()
export class MyOrdersService {
  constructor(
    @Inject(OrderRepository) private readonly orderRepository: OrderRepository,
  ) {}

  async list(
    user: User,
    query: MyOrdersQueryDto,
  ): Promise<MyOrderResponseDto[]> {
    if (user.role !== UserRole.CLIENT) {
      throw new ForbiddenException(
        'Solo los clientes pueden consultar sus pedidos.',
      );
    }

    const rows = await this.orderRepository.findMine(user.id, query.status, 50);

    return rows.map((row) => ({
      id: row.id,
      orderNumber: row.orderNumber,
      status: row.status,
      paymentStatus: onlinePaymentStatus(row),
      total: row.total?.toFixed(2) ?? '0.00',
      createdAt: row.createdAt,
      branchId: row.branchId,
      branchName: row.branch.name,
      review: row.review
        ? { id: row.review.id, rating: row.review.rating }
        : null,
    }));
  }
}
