import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { Prisma, type BranchConfig } from '@PrismaClient';
import { BranchNotFoundError } from '../errors/index.js';

const FOREIGN_KEY_VIOLATION = 'P2003';
const BRANCH_FOREIGN_KEY = 'branch_configs_branch_id_fkey';

// Con driver adapter, Prisma no llena meta.field_name: la restricción viaja aquí.
interface ForeignKeyViolationMeta {
  driverAdapterError?: { cause?: { constraint?: { index?: string } } };
}

function isBranchForeignKeyViolation(error: unknown): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== FOREIGN_KEY_VIOLATION
  )
    return false;
  const meta = error.meta as ForeignKeyViolationMeta | undefined;
  return (
    meta?.driverAdapterError?.cause?.constraint?.index === BRANCH_FOREIGN_KEY
  );
}

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
      if (isBranchForeignKeyViolation(error))
        throw new BranchNotFoundError(branchId);
      throw error;
    }
  }
}
