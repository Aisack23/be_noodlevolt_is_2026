import { randomUUID } from 'node:crypto';
import type { Prisma } from '@PrismaClient';
import { RewardError } from './reward.error.js';
import type {
  requireRewardBenefit,
  requireRewardOrder,
} from './redemption-order.js';
import { redemptionResponse, redemptionSelect } from './redemption-response.js';

type RewardApplication = {
  customerId: string;
  operationKey: string;
  benefit: Awaited<ReturnType<typeof requireRewardBenefit>>;
  order: Awaited<ReturnType<typeof requireRewardOrder>>;
  product: { id: string; name: string } | null;
  discount: Prisma.Decimal;
};

export async function applyReward(
  tx: Prisma.TransactionClient,
  input: RewardApplication,
) {
  const { customerId, operationKey, benefit, order, product, discount } = input;
  const debited = await tx.loyaltyAccount.updateMany({
    where: { userId: customerId, points: { gte: benefit.pointsCost } },
    data: { points: { decrement: benefit.pointsCost } },
  });
  if (debited.count !== 1)
    throw new RewardError(
      'CONFLICT',
      'No tienes puntos suficientes para esta recompensa.',
    );
  const redemption = await tx.redemption.create({
    data: {
      customerId,
      benefitId: benefit.id,
      operationId: operationKey,
      code: `NV-R-${randomUUID()}`,
      pointsCost: benefit.pointsCost,
      status: 'USED',
      usedAt: new Date(),
      rewardName: benefit.name,
      rewardType: benefit.rewardType,
      productName: benefit.productName,
      discountPercent: benefit.discountPercent,
    },
  });
  if (product)
    await tx.orderItem.create({
      data: {
        orderId: order.id,
        dishId: product.id,
        dishName: product.name,
        quantity: 1,
        unitPrice: 0,
        note: 'Canje de puntos',
      },
    });
  await tx.order.update({
    where: { id: order.id },
    data: {
      loyaltyRedemptionId: redemption.id,
      loyaltyDiscount: discount,
      total: order.subtotal.sub(discount),
    },
  });
  await tx.pointsMovement.create({
    data: {
      customerId,
      type: 'REDEEM',
      points: -benefit.pointsCost,
      redemptionId: redemption.id,
    },
  });
  return redemptionResponse(
    await tx.redemption.findUniqueOrThrow({
      where: { id: redemption.id },
      select: redemptionSelect,
    }),
  );
}
