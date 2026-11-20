import { Module } from '@nestjs/common';
import { BranchesModule } from '@Branches';
import { SalesReportController, TopDishesController } from './controllers/index.js';
import { SalesReportRepository, TopDishesRepository } from './repositories/index.js';
import { SalesReportService, TopDishesService } from './services/index.js';

@Module({
  imports: [BranchesModule],
  controllers: [SalesReportController, TopDishesController],
  providers: [
    SalesReportRepository,
    SalesReportService,
    TopDishesRepository,
    TopDishesService,
  ],
  exports: [SalesReportService, TopDishesService],
})
export class ReportsModule {}