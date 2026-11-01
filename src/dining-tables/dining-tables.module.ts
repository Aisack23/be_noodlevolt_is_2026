import { Module } from '@nestjs/common';
import { DiningTableRepository } from '@DiningTables/repositories';

@Module({
  providers: [DiningTableRepository],
  exports: [DiningTableRepository],
})
export class DiningTablesModule {}