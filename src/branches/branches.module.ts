import { Module } from '@nestjs/common';
import { BranchRepository } from '@Branches/repositories';
import {
  BranchConfigController,
  BranchConfigRepository,
  BranchConfigService,
} from '@Branches/config';

@Module({
  controllers: [BranchConfigController],
  providers: [BranchRepository, BranchConfigRepository, BranchConfigService],
  exports: [BranchRepository],
})
export class BranchesModule {}