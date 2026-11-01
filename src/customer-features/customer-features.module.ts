
import { Module } from '@nestjs/common';
import {
  ReviewRepository,
  PointsRuleRepository,
  PointsMovementRepository,
  BenefitRepository,
  RedemptionRepository,
  NotificationRepository,
} from '@CustomerFeatures/repositories';

@Module({
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
