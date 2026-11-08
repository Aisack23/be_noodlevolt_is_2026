import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { type Branch } from '@PrismaClient';

export interface CreateBranchData {
  name: string;
  address: string;
  timeZone?: string;
}

export interface UpdateBranchData {
  name?: string;
  address?: string;
  timeZone?: string;
}

const publicBranchSelect = {
  id: true,
  name: true,
  address: true,
  timeZone: true,
  isActive: true,
  config: { select: { isOpen: true } },
} as const;

@Injectable()
export class BranchRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  findPublicBranches() {
    return this.prisma.branch.findMany({
      select: publicBranchSelect,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  }

  findPublicBranch(id: string) {
    return this.prisma.branch.findUnique({
      where: { id },
      select: publicBranchSelect,
    });
  }

  create(data: CreateBranchData): Promise<Branch> {
    return this.prisma.branch.create({
      data,
    });
  }

  findById(id: string): Promise<Branch | null> {
    return this.prisma.branch.findUnique({
      where: { id },
    });
  }

  findAll(): Promise<Branch[]> {
    return this.prisma.branch.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  findActive(): Promise<Branch[]> {
    return this.prisma.branch.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  update(id: string, data: UpdateBranchData): Promise<Branch> {
    return this.prisma.branch.update({
      where: { id },
      data,
    });
  }

  setActive(id: string, isActive: boolean): Promise<Branch> {
    return this.prisma.branch.update({
      where: { id },
      data: { isActive },
    });
  }
}
