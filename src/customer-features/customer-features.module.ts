
import { Module } from '@nestjs/common';
import { AccountsOrdersModule } from '@AccountsOrders';
import {
  ReviewRepository,
  PointsRuleRepository,
  PointsMovementRepository,
  BenefitRepository,
  RedemptionRepository,
  NotificationRepository,
} from '@CustomerFeatures/repositories';

@Module({
  imports: [AccountsOrdersModule],
  providers: [
    ReviewRepository,
    PointsRuleRepository,
    PointsMovementRepository,
    BenefitRepository,
    RedemptionRepository,
    NotificationRepository,
  ],
  exports: [
    ReviewRepository,
    PointsRuleRepository,
    PointsMovementRepository,
    BenefitRepository,
    RedemptionRepository,
    NotificationRepository,
  ],
})
export class CustomerFeaturesModule {}
