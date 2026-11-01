import { Module } from '@nestjs/common';
import { BranchRepository } from '@Branches/repositories';

@Module({
  providers: [BranchRepository],
  exports: [BranchRepository],
})
export class BranchesModule {}