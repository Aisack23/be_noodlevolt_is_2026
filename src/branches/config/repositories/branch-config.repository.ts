import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { Prisma, type BranchConfig } from '@PrismaClient';
import { BranchNotFoundError } from '../errors/index.js';

const FOREIGN_KEY_VIOLATION = 'P2003';

@Injectable()
export class BranchConfigRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findIsOpen(branchId: string): Promise<boolean> {
    const config = await this.prisma.branchConfig.findFirst({
      where: { branchId, branch: { isActive: true } },
      select: { isOpen: true },
    });
    if (!config) throw new BranchNotFoundError(branchId);
    return config.isOpen;
  }

  async setIsOpen(
    branchId: string,
    isOpen: boolean,
    updatedBy: string,
  ): Promise<BranchConfig> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const branch = await tx.branch.findFirst({
          where: { id: branchId, isActive: true },
          select: { id: true },
        });
        if (!branch) throw new BranchNotFoundError(branchId);
        return tx.branchConfig.upsert({
          where: { branchId },
          update: { isOpen, updatedBy },
          create: { branchId, isOpen, updatedBy },
        });
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === FOREIGN_KEY_VIOLATION
      )
        throw new BranchNotFoundError(branchId);
      throw error;
    }
  }
}
