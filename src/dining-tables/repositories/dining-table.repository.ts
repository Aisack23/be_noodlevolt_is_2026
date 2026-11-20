
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { type DiningTable, type TableStatus } from '@PrismaClient';

export interface CreateDiningTableData {
  branchId: string;
  number: string;
  capacity: number;
}

export interface UpdateDiningTableData {
  number?: string;
  capacity?: number;
}

@Injectable()
export class DiningTableRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: CreateDiningTableData): Promise<DiningTable> {
    return this.prisma.diningTable.create({
      data,
    });
  }

  findById(id: string): Promise<DiningTable | null> {
    return this.prisma.diningTable.findUnique({
      where: { id },
    });
  }

  findByBranch(branchId: string): Promise<DiningTable[]> {
    return this.prisma.diningTable.findMany({
      where: { branchId },
      orderBy: { number: 'asc' },
    });
  }

  findByBranchAndStatus(
    branchId: string,
    status: TableStatus,
  ): Promise<DiningTable[]> {
    return this.prisma.diningTable.findMany({
      where: { branchId, status },
      orderBy: { number: 'asc' },
    });
  }

  update(
    id: string,
    data: UpdateDiningTableData,
  ): Promise<DiningTable> {
    return this.prisma.diningTable.update({
      where: { id },
      data,
    });
  }

  updateStatus(
    id: string,
    status: TableStatus,
  ): Promise<DiningTable> {
    return this.prisma.diningTable.update({
      where: { id },
      data: { status },
    });
  }

  deleteById(id: string): Promise<DiningTable> {
    return this.prisma.diningTable.delete({
      where: { id },
    });
  }
}
