import {
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { type User, UserRole } from '@PrismaClient';
import { OrderRepository } from '@AccountsOrders/repositories';
import type { MyOrderResponseDto } from '../dto/my-order-response.dto.js';
import type { MyOrdersQueryDto } from '../dto/my-orders-query.dto.js';

@Injectable()
export class MyOrdersService {
  constructor(
    @Inject(OrderRepository) private readonly orderRepository: OrderRepository,
  ) {}

  async list(user: User, query: MyOrdersQueryDto): Promise<MyOrderResponseDto[]> {
    if (user.role !== UserRole.CLIENT) {
      throw new ForbiddenException('Solo los clientes pueden consultar sus pedidos.');
    }

    const rows = await this.orderRepository.findMine(
      user.id,
      query.status,
      50,
    );

    return rows.map((row) => ({
      id: row.id,
      orderNumber: row.orderNumber,
      status: row.status,
      total: this.formatMoney(row.total),
      createdAt: row.createdAt,
      branchId: row.branchId,
      branchName: row.branch.name,
      review: row.review ? { id: row.review.id, rating: row.review.rating } : null,
    }));
  }

  private formatMoney(value: unknown): string {
    if (value == null) return '0.00';
    const amount = Number(String(value));
    return Number.isFinite(amount) ? amount.toFixed(2) : '0.00';
  }
}
