
import { Module } from '@nestjs/common';
import {
  PaymentRepository,
  PaymentDetailRepository,
  FiscalDocumentRepository,
  FiscalClientRepository,
} from '@Payments/repositories';

@Module({
  providers: [
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
