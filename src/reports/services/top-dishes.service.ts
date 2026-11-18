import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { User } from '@PrismaClient';
import { BranchRepository } from '@Branches/repositories';
import { TopDishesQueryDto, TopDishesResponseDto } from '../dto/index.js';
import { InvalidBranchTimeZoneError, InvalidSalesDateRangeError } from '../errors/index.js';
import { TopDishesRepository } from '../repositories/index.js';
import { parseSalesDateRange, toUtcSalesDateRange } from './sales-date-range.js';

export type TopDishesActor = Pick<User, 'role' | 'branchId'>;

@Injectable()
export class TopDishesService {
  constructor(
    @Inject(TopDishesRepository)
    private readonly repository: TopDishesRepository,
    @Inject(BranchRepository)
    private readonly branchRepository: BranchRepository,
  ) {}

  async getTopDishes(
    actor: TopDishesActor,
    query: TopDishesQueryDto,
  ): Promise<TopDishesResponseDto> {
    if (actor.role !== 'BRANCH_ADMIN' && actor.role !== 'GENERAL_MANAGER') {
      throw new ForbiddenException(
        'No tiene permiso para consultar los platillos más vendidos.',
      );
    }

    let reportRange;
    try {
      reportRange = parseSalesDateRange(query.from, query.to);
    } catch (error) {
      if (
        error instanceof InvalidSalesDateRangeError ||
        error instanceof InvalidBranchTimeZoneError
      ) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }

    const selectedBranches = await this.resolveBranches(actor, query.branchId);
    const totals = await Promise.all(
      selectedBranches.map(async (branch) => {
        const utcRange = toUtcSalesDateRange(reportRange, branch.timeZone);
        return this.repository.findSoldItems({
          branchId: branch.id,
          start: utcRange.start,
          end: utcRange.end,
        });
      }),
    );

    const consolidated = new Map<string, { dishId: string; dishName: string; quantity: number }>();
    for (const branchItems of totals) {
      for (const item of branchItems) {
        const current = consolidated.get(item.dishId);
        if (current) {
          current.quantity += item.quantity;
        } else {
          consolidated.set(item.dishId, { ...item });
        }
      }
    }

    const dishes = Array.from(consolidated.values())
      .sort((a, b) => {
        if (b.quantity !== a.quantity) return b.quantity - a.quantity;
        return a.dishName.localeCompare(b.dishName, 'es');
      })
      .slice(0, query.limit ?? 10);

    return TopDishesResponseDto.from({
      from: query.from,
      to: query.to,
      branchId:
        actor.role === 'GENERAL_MANAGER'
          ? (query.branchId ?? null)
          : (selectedBranches[0]?.id ?? null),
      dishes,
    });
  }

  private async resolveBranches(actor: TopDishesActor, requestedBranchId?: string) {
    if (actor.role === 'BRANCH_ADMIN') {
      if (!actor.branchId) {
        throw new ForbiddenException(
          'No tiene permiso para consultar los platillos más vendidos.',
        );
      }
      if (requestedBranchId && requestedBranchId !== actor.branchId) {
        throw new ForbiddenException(
          'No tiene permiso para consultar otra sucursal.',
        );
      }

      const branch = await this.branchRepository.findById(actor.branchId);
      if (!branch) throw new NotFoundException('La sucursal no existe.');
      return [branch];
    }

    if (requestedBranchId) {
      const branch = await this.branchRepository.findById(requestedBranchId);
      if (!branch) throw new NotFoundException('La sucursal no existe.');
      return [branch];
    }

    return this.branchRepository.findAll();
  }
}
