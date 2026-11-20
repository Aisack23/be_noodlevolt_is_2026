import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PageQueryDto } from '../../common/dto/page-query.dto.js';
import type { CreateRedemptionDto } from './reward.dto.js';
import { RewardsRepository } from './rewards.repository.js';
import { RewardError } from './reward.error.js';

type RewardActor = { id: string; role: string };

@Injectable()
export class RewardsService {
  constructor(
    @Inject(RewardsRepository) private readonly repository: RewardsRepository,
  ) {}

  catalog(actor: RewardActor) {
    this.requireClient(actor);
    return this.repository.catalog();
  }

  history(actor: RewardActor, query: PageQueryDto) {
    this.requireClient(actor);
    return this.repository.history(actor.id, query);
  }

  async redeem(actor: RewardActor, input: CreateRedemptionDto) {
    this.requireClient(actor);
    try {
      return await this.repository.redeem(actor.id, {
        benefitId: input.benefitId.toLowerCase(),
        orderId: input.orderId.toLowerCase(),
        operationKey: input.operationKey.toLowerCase(),
      });
    } catch (error) {
      if (error instanceof RewardError) {
        if (error.kind === 'NOT_FOUND')
          throw new NotFoundException(error.message);
        throw new ConflictException(error.message);
      }
      throw error;
    }
  }

  private requireClient(actor: RewardActor) {
    if (actor.role !== 'CLIENT')
      throw new ForbiddenException(
        'Solo los clientes pueden consultar y canjear recompensas.',
      );
  }
}
