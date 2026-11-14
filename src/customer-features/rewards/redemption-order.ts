import { Prisma } from '@PrismaClient';
import { RewardError } from './reward.error.js';

export async function requireRewardBenefit(
  tx: Prisma.TransactionClient,
  id: string,
) {
  await tx.$queryRaw`SELECT id FROM benefits WHERE id=${id}::uuid FOR SHARE`;
  const benefit = await tx.benefit.findUnique({ where: { id } });
  if (!benefit?.isActive || !benefit.rewardType)
    throw new RewardError('NOT_FOUND', 'La recompensa no está disponible.');
  if (benefit.pointsCost <= 0)
    throw new RewardError('CONFLICT', 'La recompensa tiene un coste inválido.');
  return { ...benefit, rewardType: benefit.rewardType };
}

export async function requireRewardOrder(
  tx: Prisma.TransactionClient,
  orderId: string,
  customerId: string,
) {
  await tx.$queryRaw`SELECT id FROM orders WHERE id=${orderId}::uuid FOR UPDATE`;
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      branchId: true,
      customerId: true,
      status: true,
      type: true,
      loyaltyRedemptionId: true,
      items: { select: { unitPrice: true, quantity: true } },
      payments: { where: { status: 'PAID' }, select: { id: true } },
    },
  });
  if (!order || order.customerId !== customerId)
    throw new RewardError('NOT_FOUND', 'El pedido no existe.');
  if (
    order.status !== 'PENDING' ||
    order.type !== 'TAKEOUT' ||
    order.payments.length ||
    order.loyaltyRedemptionId
  ) {
    throw new RewardError(
      'CONFLICT',
      'Se requiere un pedido para llevar pendiente, sin pago aprobado ni otro canje.',
    );
  }
  const subtotal = order.items.reduce(
    (sum, line) => sum.add(line.unitPrice.mul(line.quantity)),
    new Prisma.Decimal(0),
  );
  if (subtotal.lte(0))
    throw new RewardError(
      'CONFLICT',
      'El pedido debe contener productos con importe positivo.',
    );
  const branch = await tx.$queryRaw<{ isActive: boolean }[]>`
    SELECT is_active AS "isActive" FROM branches WHERE id=${order.branchId}::uuid FOR SHARE`;
  const config = await tx.$queryRaw<{ isOpen: boolean }[]>`
    SELECT is_open AS "isOpen" FROM branch_configs WHERE branch_id=${order.branchId}::uuid FOR SHARE`;
  if (!branch[0]?.isActive || !config[0]?.isOpen)
    throw new RewardError('CONFLICT', 'La sucursal no acepta canjes.');
  return { ...order, subtotal };
}

export async function requireRewardProduct(
  tx: Prisma.TransactionClient,
  branchId: string,
  name: string | null,
) {
  if (!name)
    throw new RewardError(
      'CONFLICT',
      'La recompensa no tiene un producto configurado.',
    );
  const rows = await tx.$queryRaw<{ id: string; name: string }[]>`
    SELECT d.id, d.name FROM dishes d
    JOIN categories c ON c.id=d.category_id AND c.branch_id=d.branch_id
    WHERE d.branch_id=${branchId}::uuid AND d.name=${name}
      AND d.is_available AND NOT d.is_deleted AND d.status='AVAILABLE' AND c.is_active
    FOR SHARE OF d,c`;
  if (!rows[0])
    throw new RewardError(
      'CONFLICT',
      'El producto de la recompensa no está disponible en esta sucursal.',
    );
  return rows[0];
}
