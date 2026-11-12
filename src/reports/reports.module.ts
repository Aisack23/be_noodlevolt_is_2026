import { Module } from '@nestjs/common';
import { BranchesModule } from '@Branches';
import { SalesReportController } from './controllers/index.js';
import { SalesReportRepository } from './repositories/index.js';
import { SalesReportService } from './services/index.js';

@Module({
  imports: [BranchesModule],
  controllers: [SalesReportController],
  providers: [SalesReportRepository, SalesReportService],
  exports: [SalesReportService],
})
export class ReportsModule {}
