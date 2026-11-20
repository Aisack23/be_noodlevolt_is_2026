import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { LoyaltyRepository } from '../repositories/loyalty.repository.js';
import type { LoyaltyBalanceDto } from '../dto/loyalty-balance.dto.js';

@Injectable()
export class LoyaltyService {
  constructor(
    @Inject(LoyaltyRepository) private readonly repository: LoyaltyRepository,
  ) {}

  async getBalance(user: {
    id: string;
    role: string;
  }): Promise<LoyaltyBalanceDto> {
    if (user.role !== 'CLIENT') {
      throw new ForbiddenException(
        'Solo los clientes pueden consultar su saldo de puntos.',
      );
    }
    return { points: await this.repository.getBalance(user.id) };
  }
}
