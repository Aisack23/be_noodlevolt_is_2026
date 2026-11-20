import { Injectable } from '@nestjs/common';
import { setTimeout } from 'node:timers/promises';
import type { SimulatePaymentDto } from '../dto/simulate-payment.dto.js';

export interface CardDecision {
  approved: boolean;
  last4: '4242' | '0002';
  reason: string | null;
}

@Injectable()
export class TestCardGateway {
  async authorize(
    token: SimulatePaymentDto['cardToken'],
  ): Promise<CardDecision> {
    await setTimeout(2000);
    const approved = token === 'test_4242';
    return {
      approved,
      last4: approved ? '4242' : '0002',
      reason: approved ? null : 'La tarjeta de prueba fue rechazada.',
    };
  }
}
