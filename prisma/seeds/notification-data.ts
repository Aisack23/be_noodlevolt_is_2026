import {
  Prisma,
  type PrismaClient,
} from '../../src/generated/prisma/client.js';
import { BASE_BRANCHES } from './base-data.js';

export async function seedNotificationData(prisma: PrismaClient) {
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({
      where: { email: 'demo@example.com' },
    });
    for (const { name } of BASE_BRANCHES) {
      const branch = await tx.branch.findUniqueOrThrow({ where: { name } });
      const dish = await tx.dish.findUniqueOrThrow({
        where: {
          branchId_name: { branchId: branch.id, name: 'Ramen de pollo' },
        },
      });
      const quantity = 2;
      const total = new Prisma.Decimal(dish.price).mul(quantity);
      const order = await tx.order.upsert({
        where: {
          branchId_orderNumber: {
            branchId: branch.id,
            orderNumber: 'DB09-READY',
          },
        },
        update: {},
        create: {
          branchId: branch.id,
          customerId: user.id,
          orderNumber: 'DB09-READY',
          type: 'DINE_IN',
          status: 'READY',
          total,
          items: {
            create: {
              dishId: dish.id,
              dishName: dish.name,
              quantity,
              unitPrice: dish.price,
              status: 'READY',
            },
          },
        },
      });
      const eventKey = 'PEDIDO_LISTO:' + order.id + ':' + user.id;
      await tx.notification.upsert({
        where: { userId_eventKey: { userId: user.id, eventKey } },
        update: {},
        create: {
          userId: user.id,
          orderId: order.id,
          eventKey,
          type: 'PEDIDO_LISTO',
          title: 'Pedido listo',
          message: 'Tu pedido DB09-READY está listo en ' + branch.name + '.',
        },
      });
    }
  });
}
