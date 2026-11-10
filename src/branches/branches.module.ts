import { BranchesQueryController } from './controllers/branches-query.controller.js';
import { BranchesQueryService } from './services/branches-query.service.js';
import { Module } from '@nestjs/common';
import { BranchRepository } from '@Branches/repositories';
import {
  BranchConfigController,
  BranchConfigRepository,
  BranchConfigService,
} from '@Branches/config';

@Module({
  controllers: [BranchConfigController, BranchesQueryController],
  providers: [
    BranchRepository,
    BranchConfigRepository,
    BranchConfigService,
    BranchesQueryService,
  ],
  exports: [BranchRepository],
})
export class BranchesModule {}
