import type { Prisma } from '@PrismaClient';

export const INVENTORY_CONSUMER = Symbol('InventoryConsumer');

export interface InventoryConsumer {
  consume(
    orderId: string,
    transaction: Prisma.TransactionClient,
  ): Promise<void>;
}
