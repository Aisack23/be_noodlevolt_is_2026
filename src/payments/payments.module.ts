import { SimulatedPaymentsController } from './simulation/controllers/simulated-payments.controller.js';
import { SimulatedPaymentsService } from './simulation/services/simulated-payments.service.js';
import { SimulatedPaymentsRepository } from './simulation/repositories/simulated-payments.repository.js';
import { TestCardGateway } from './simulation/services/test-card-gateway.js';

import { Module } from '@nestjs/common';
import {
  PaymentRepository,
  PaymentDetailRepository,
  FiscalDocumentRepository,
  FiscalClientRepository,
} from '@Payments/repositories';

@Module({
  controllers: [SimulatedPaymentsController],
  providers: [
    SimulatedPaymentsService,
    SimulatedPaymentsRepository,
    TestCardGateway,
    PaymentRepository,
    PaymentDetailRepository,
    FiscalDocumentRepository,
    FiscalClientRepository,
  ],
  exports: [
    PaymentRepository,
    PaymentDetailRepository,
    FiscalDocumentRepository,
    FiscalClientRepository,
  ],
})
export class PaymentsModule {}
