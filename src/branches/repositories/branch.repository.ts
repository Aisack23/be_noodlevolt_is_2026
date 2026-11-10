
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import type { Branch } from '@PrismaClient';

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

@Injectable()
export class BranchRepository {
  constructor(private readonly prisma: PrismaService) {}

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
