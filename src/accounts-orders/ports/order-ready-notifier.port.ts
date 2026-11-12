import type { Prisma } from '@PrismaClient';

// El puerto comparte el cliente transaccional para que el aviso sea atómico con el avance.
export abstract class OrderReadyNotifier {
  abstract notifyOrderReady(
    orderId: string,
    tx: Prisma.TransactionClient,
  ): Promise<unknown>;
}
