import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { CreateOrderDto } from '../dto/create-order.dto.js';
import { OrdersRepository } from '../repositories/orders.repository.js';
import { normalizeOrder, orderRequestHash } from './order-request.js';

export interface OrderCustomer {
  id: string;
  role: string;
}

@Injectable()
export class OrdersService {
  constructor(
    @Inject(OrdersRepository) private readonly repository: OrdersRepository,
  ) {}

  create(customer: OrderCustomer, input: CreateOrderDto) {
    if (customer.role !== 'CLIENT')
      throw new ForbiddenException('Solo los clientes pueden crear pedidos.');
    const normalized = normalizeOrder(input);
    return this.repository.create(
      customer.id,
      normalized,
      orderRequestHash(customer.id, normalized),
    );
  }
}
