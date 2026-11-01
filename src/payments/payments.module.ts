
import { Module } from '@nestjs/common';
import {
  PaymentRepository,
  PaymentDetailRepository,
  FiscalDocumentRepository,
} from '@Payments/repositories';

@Module({
  providers: [
    PaymentRepository,
    PaymentDetailRepository,
    FiscalDocumentRepository,
  ],
  exports: [
    PaymentRepository,
    PaymentDetailRepository,
    FiscalDocumentRepository,
  ],
})
export class PaymentsModule {}
