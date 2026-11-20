import { Module } from '@nestjs/common';
import { LoyaltyController } from './controllers/loyalty.controller.js';
import { LoyaltyService } from './services/loyalty.service.js';
import { LoyaltyRepository } from './repositories/loyalty.repository.js';
import { RewardsController } from './rewards/rewards.controller.js';
import { RewardsService } from './rewards/rewards.service.js';
import { RewardsRepository } from './rewards/rewards.repository.js';
import { AccountsOrdersModule } from '@AccountsOrders';
import { BranchesModule } from '@Branches';
import {
  ReviewsController,
  BranchesReviewsController,
} from './controllers/index.js';
import {
  ReviewRepository,
  PointsRuleRepository,
  PointsMovementRepository,
  BenefitRepository,
  RedemptionRepository,
  NotificationRepository,
} from '@CustomerFeatures/repositories';
import { ReviewsService } from './services/reviews.service.js';

@Module({
  imports: [AccountsOrdersModule, BranchesModule],
  controllers: [
    ReviewsController,
    BranchesReviewsController,
    LoyaltyController,
    RewardsController,
  ],
  providers: [
    RewardsService,
    RewardsRepository,
    LoyaltyService,
    LoyaltyRepository,
    ReviewRepository,
    ReviewsService,
    PointsRuleRepository,
    PointsMovementRepository,
    BenefitRepository,
    RedemptionRepository,
    NotificationRepository,
  ],
  exports: [
    LoyaltyRepository,
    ReviewRepository,
    ReviewsService,
    PointsRuleRepository,
    PointsMovementRepository,
    BenefitRepository,
    RedemptionRepository,
    NotificationRepository,
  ],
})
export class CustomerFeaturesModule {}
