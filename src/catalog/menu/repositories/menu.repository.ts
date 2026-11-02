import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { BranchNotFoundError } from '../errors/index.js';
import type { BranchMenu } from '../types/index.js';

@Injectable()
export class MenuRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findByBranchId(branchId: string): Promise<BranchMenu> {
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
      select: { id: true, name: true },
    });
    if (!branch) throw new BranchNotFoundError(branchId);

    const dishes = await this.prisma.dish.findMany({
      where: { branchId, status: { not: 'DISABLED' } },
      include: { category: { select: { id: true, name: true } } },
      orderBy: [{ category: { name: 'asc' } }, { name: 'asc' }, { id: 'asc' }],
    });
    return {
      branch,
      dishes: dishes.map(
        ({ id, name, description, price, status, category }) => ({
          id,
          name,
          description,
          price,
          status,
          category,
        }),
      ),
    };
  }
}
