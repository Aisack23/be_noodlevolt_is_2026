
import { Module } from '@nestjs/common';
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
   ReviewRepository,
   ReviewsService,
   PointsRuleRepository,
   PointsMovementRepository,
   BenefitRepository,
   RedemptionRepository,
   NotificationRepository,
 ],
 exports: [
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
