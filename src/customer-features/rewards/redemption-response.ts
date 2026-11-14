import { Prisma } from '@PrismaClient';
import type { RedemptionResponseDto } from './reward.dto.js';

export const redemptionSelect = {
  id: true,
  benefitId: true,
  customerId: true,
  operationId: true,
  code: true,
  pointsCost: true,
  rewardName: true,
  rewardType: true,
  productName: true,
  discountPercent: true,
  status: true,
  createdAt: true,
  usedAt: true,
  benefit: { select: { name: true } },
  order: { select: { id: true, total: true, loyaltyDiscount: true } },
} as const satisfies Prisma.RedemptionSelect;

export type StoredRedemption = Prisma.RedemptionGetPayload<{
  select: typeof redemptionSelect;
}>;

export function redemptionResponse(
  row: StoredRedemption,
): RedemptionResponseDto {
  return {
    id: row.id,
    benefitId: row.benefitId,
    code: row.code,
    pointsCost: row.pointsCost,
    rewardName: row.rewardName ?? row.benefit.name,
    rewardType: row.rewardType,
    productName: row.productName,
    discountPercent: row.discountPercent,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    usedAt: row.usedAt?.toISOString() ?? null,
    order: row.order
      ? {
          id: row.order.id,
          total: row.order.total?.toFixed(2) ?? null,
          discount: row.order.loyaltyDiscount.toFixed(2),
        }
      : null,
  };
}
