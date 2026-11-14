import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { Prisma } from '@PrismaClient';
import type { PageQueryDto } from '../../common/dto/page-query.dto.js';
import type { CreateRedemptionDto } from './reward.dto.js';
import { RewardError } from './reward.error.js';
import { redemptionResponse, redemptionSelect } from './redemption-response.js';
import {
  requireRewardBenefit,
  requireRewardOrder,
  requireRewardProduct,
} from './redemption-order.js';
import { rewardDiscount } from './reward-pricing.js';
import { applyReward } from './redemption-write.js';

@Injectable()
export class RewardsRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async catalog() {
    const rewards = await this.prisma.benefit.findMany({
      where: { isActive: true, rewardType: { not: null } },
      select: {
        id: true,
        name: true,
        description: true,
        pointsCost: true,
        rewardType: true,
        productName: true,
        discountPercent: true,
      },
      orderBy: [{ pointsCost: 'asc' }, { id: 'asc' }],
    });
    return rewards.map((reward) => ({
      ...reward,
      rewardType: reward.rewardType!,
    }));
  }

  async history(customerId: string, { page, limit }: PageQueryDto) {
    const where = { customerId };
    const [rows, total] = await this.prisma.$transaction(
      [
        this.prisma.redemption.findMany({
          where,
          select: redemptionSelect,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        }),
        this.prisma.redemption.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return { items: rows.map(redemptionResponse), total, page, limit };
  }

  redeem(customerId: string, input: CreateRedemptionDto) {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'loyalty:' + input.operationKey},0))::text`;
        const existing = await tx.redemption.findUnique({
          where: { operationId: input.operationKey },
          select: redemptionSelect,
        });
        if (existing) {
          if (
            existing.customerId !== customerId ||
            existing.benefitId !== input.benefitId ||
            existing.order?.id !== input.orderId
          ) {
            throw new RewardError(
              'CONFLICT',
              'La clave de operación ya corresponde a otro canje.',
            );
          }
          return { created: false, redemption: redemptionResponse(existing) };
        }
        const order = await requireRewardOrder(tx, input.orderId, customerId);
        const benefit = await requireRewardBenefit(tx, input.benefitId);
        const product =
          benefit.rewardType === 'PRODUCT'
            ? await requireRewardProduct(
                tx,
                order.branchId,
                benefit.productName,
              )
            : null;
        const discount =
          benefit.rewardType === 'PERCENT_DISCOUNT'
            ? rewardDiscount(order.subtotal, benefit.discountPercent)
            : new Prisma.Decimal(0);
        const redemption = await applyReward(tx, {
          customerId,
          operationKey: input.operationKey,
          benefit,
          order,
          product,
          discount,
        });
        return { created: true, redemption };
      },
      { timeout: 10000 },
    );
  }
}
