
import { Module } from '@nestjs/common';
import { LoyaltyRepository } from './repositories/loyalty.repository.js';
import { AccountsOrdersModule } from '@AccountsOrders';
import { BranchesModule } from '@Branches';
import { ReviewsController, BranchesReviewsController } from './controllers/index.js';
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
 controllers: [ReviewsController, BranchesReviewsController],
 providers: [
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
