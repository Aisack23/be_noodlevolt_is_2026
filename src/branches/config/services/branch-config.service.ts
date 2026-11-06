import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { User } from '@PrismaClient';
import {
  BranchConfigResponseDto,
  BranchStatusResponseDto,
} from '../dto/index.js';
import { BranchNotFoundError } from '../errors/index.js';
import { BranchConfigRepository } from '../repositories/index.js';

type BranchConfigActor = Pick<User, 'id' | 'role' | 'branchId'>;

@Injectable()
export class BranchConfigService {
  constructor(
    @Inject(BranchConfigRepository)
    private readonly repository: BranchConfigRepository,
  ) {}

  async getStatus(branchId: string): Promise<BranchStatusResponseDto> {
    try {
      return BranchStatusResponseDto.fromIsOpen(
        await this.repository.findIsOpen(branchId),
      );
    } catch (error) {
      throw toHttpError(error);
    }
  }

  async updateStatus(
    actor: BranchConfigActor,
    branchId: string,
    isOpen: boolean,
  ): Promise<BranchConfigResponseDto> {
    // Se revisa antes de buscar la sucursal para no revelar si un id ajeno existe.
    if (actor.role !== 'BRANCH_ADMIN' || actor.branchId !== branchId) {
      throw new ForbiddenException(
        'Solo el gerente de la sucursal puede cambiar su estado.',
      );
    }
    try {
      return BranchConfigResponseDto.fromConfig(
        await this.repository.setIsOpen(branchId, isOpen, actor.id),
      );
    } catch (error) {
      throw toHttpError(error);
    }
  }
}

function toHttpError(error: unknown): unknown {
  return error instanceof BranchNotFoundError
    ? new NotFoundException(error.message)
    : error;
}
