import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CreateOrderDto } from '../dto/create-order.dto.js';
import type { CreateSalonOrderDto } from '../dto/create-salon-order.dto.js';
import { OrdersRepository } from '../repositories/orders.repository.js';
import { normalizeOrder, orderRequestHash } from './order-request.js';

export interface OrderCustomer {
  id: string;
  role: string;
}

export interface OrderActor extends OrderCustomer {
  branchId: string | null;
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

  createSalon(waiter: OrderActor, input: CreateSalonOrderDto) {
    if (waiter.role !== 'WAITER' || !waiter.branchId) {
      throw new ForbiddenException(
        'Solo los meseros de una sucursal pueden registrar pedidos de salón.',
      );
    }
    return this.repository.createSalon(waiter.id, waiter.branchId, input);
  }
}