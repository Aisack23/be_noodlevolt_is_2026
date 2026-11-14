import { Module } from '@nestjs/common';
import { DiningTableRepository } from '@DiningTables/repositories';
import { DiningQueryController } from './controllers/dining-query.controller.js';
import { DiningQueryService } from './services/dining-query.service.js';
import { DiningQueryRepository } from './repositories/dining-query.repository.js';

@Module({
  controllers: [DiningQueryController],
  providers: [DiningTableRepository, DiningQueryService, DiningQueryRepository],
  exports: [DiningTableRepository],
})
export class DiningTablesModule {}
