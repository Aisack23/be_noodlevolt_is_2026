import type { PrismaClient } from '../../src/generated/prisma/client.js';

export async function seedNotificationData(prisma: PrismaClient) {
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.upsert({
      where: { email: 'db09@example.com' },
      update: {},
      create: {
        email: 'db09@example.com',
        name: 'Cliente DB09',
        passwordHash: '!disabled',
        role: 'CLIENT',
      },
    });
    const branch = await tx.branch.upsert({
      where: { name: 'Sucursal DB09' },
      update: {},
      create: { name: 'Sucursal DB09', address: 'Datos de prueba' },
    });
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
      },
    });
    const eventKey = `PEDIDO_LISTO:${order.id}`;
    await tx.notification.upsert({
      where: { userId_eventKey: { userId: user.id, eventKey } },
      update: {},
      create: {
        userId: user.id,
        orderId: order.id,
        eventKey,
        type: 'PEDIDO_LISTO',
        title: 'Pedido listo',
        message: 'Tu pedido DB09-READY est� listo en Sucursal DB09.',
      },
    });
  });
}
