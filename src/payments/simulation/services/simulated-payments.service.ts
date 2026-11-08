import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { SimulatePaymentDto } from '../dto/simulate-payment.dto.js';
import { SimulatedPaymentsRepository } from '../repositories/simulated-payments.repository.js';
import { TestCardGateway } from './test-card-gateway.js';

@Injectable()
export class SimulatedPaymentsService {
  constructor(
    @Inject(SimulatedPaymentsRepository)
    private readonly repository: SimulatedPaymentsRepository,
    @Inject(TestCardGateway) private readonly gateway: TestCardGateway,
  ) {}

  async simulate(
    customer: { id: string; role: string },
    input: SimulatePaymentDto,
  ) {
    if (customer.role !== 'CLIENT')
      throw new ForbiddenException(
        'Solo los clientes pueden pagar sus pedidos.',
      );
    await this.repository.requirePayable(input.orderId, customer.id);
    const decision = await this.gateway.authorize(input.cardToken);
    return this.repository.record(input.orderId, customer.id, decision);
  }
}
