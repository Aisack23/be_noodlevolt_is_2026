import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { User } from '@PrismaClient';
import { Prisma } from '@PrismaClient';
import { BranchRepository } from '@Branches/repositories';
import { SalesReportQueryDto, SalesReportResponseDto } from '../dto/index.js';
import { InvalidBranchTimeZoneError, InvalidSalesDateRangeError } from '../errors/index.js';
import { SalesReportRepository } from '../repositories/index.js';
import { parseSalesDateRange, toUtcSalesDateRange } from './sales-date-range.js';

export type SalesReportActor = Pick<User, 'role' | 'branchId'>;

@Injectable()
export class SalesReportService {
  constructor(
    @Inject(SalesReportRepository)
    private readonly repository: SalesReportRepository,
    @Inject(BranchRepository)
    private readonly branchRepository: BranchRepository,
  ) {}

  async getSales(
    actor: SalesReportActor,
    query: SalesReportQueryDto,
  ): Promise<SalesReportResponseDto> {
    if (actor.role !== 'BRANCH_ADMIN' && actor.role !== 'GENERAL_MANAGER') {
      throw new ForbiddenException(
        'No tiene permiso para consultar el reporte de ventas.',
      );
    }

    const requestedBranchId = query.branchId;
    const reportRange = this.parseRange(query.from, query.to);

    const selectedBranches = await this.resolveBranches(actor, requestedBranchId);
    const totals = await Promise.all(
      selectedBranches.map(async (branch) => {
        const utcRange = toUtcSalesDateRange(reportRange, branch.timeZone);
        const aggregate = await this.repository.aggregateApproved({
          branchId: branch.id,
          start: utcRange.start,
          end: utcRange.end,
        });

        return {
          total: aggregate.total ?? new Prisma.Decimal(0),
          paymentsCount: aggregate.paymentsCount,
        };
      }),
    );

    const overallTotal = totals.reduce(
      (sum, current) => sum.plus(current.total),
      new Prisma.Decimal(0),
    );
    const overallCount = totals.reduce(
      (count, current) => count + current.paymentsCount,
      0,
    );

    return SalesReportResponseDto.from({
      from: query.from,
      to: query.to,
      branchId: this.respondingBranchId(actor.role, requestedBranchId, selectedBranches),
      total: overallTotal,
      paymentsCount: overallCount,
    });
  }

  private parseRange(from: string, to: string) {
    try {
      return parseSalesDateRange(from, to);
    } catch (error) {
      if (
        error instanceof InvalidSalesDateRangeError ||
        error instanceof InvalidBranchTimeZoneError
      ) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  private async resolveBranches(
    actor: SalesReportActor,
    requestedBranchId?: string,
  ) {
    if (actor.role === 'BRANCH_ADMIN') {
      if (!actor.branchId) {
        throw new ForbiddenException(
          'No tiene permiso para consultar el reporte de ventas.',
        );
      }
      if (requestedBranchId && requestedBranchId !== actor.branchId) {
        throw new ForbiddenException(
          'No tiene permiso para consultar otra sucursal.',
        );
      }

      const branch = await this.branchRepository.findById(actor.branchId);
      if (!branch) {
        throw new NotFoundException('La sucursal no existe.');
      }
      return [branch];
    }

    if (requestedBranchId) {
      const branch = await this.branchRepository.findById(requestedBranchId);
      if (!branch) {
        throw new NotFoundException('La sucursal no existe.');
      }
      return [branch];
    }

    return this.branchRepository.findAll();
  }

  private respondingBranchId(
    role: User['role'],
    requestedBranchId: string | undefined,
    selectedBranches: { id: string }[],
  ): string | null {
    if (role === 'GENERAL_MANAGER') {
      return requestedBranchId ?? null;
    }
    return selectedBranches[0]?.id ?? null;
  }
}
