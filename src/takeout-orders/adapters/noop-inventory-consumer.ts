import { Injectable } from '@nestjs/common';
import type { Prisma } from '@PrismaClient';
import type { InventoryConsumer } from '../ports/index.js';

@Injectable()
export class NoopInventoryConsumer implements InventoryConsumer {
  // TODO(E5) BE-5.1.2: sustituir por el provider de InventoryModule que usa
  // esta misma transacción para bloquear y descontar insumos por pedido.
  consume(
    _orderId: string,
    _transaction: Prisma.TransactionClient,
  ): Promise<void> {
    return Promise.resolve();
  }
}
