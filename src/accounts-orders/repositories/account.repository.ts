
import { Injectable } from '@nestjs/common';
import { Account, AccountStatus } from '@PrismaClient';
import { PrismaService } from '@Prisma/services';

export interface CreateAccountData {
  branchId: string;
  tableId?: string | null;
  customerId?: string | null;
  status?: AccountStatus;
  openedAt?: Date;
}

export interface UpdateAccountData {
  tableId?: string | null;
  customerId?: string | null;
  closedAt?: Date | null;
}

@Injectable()
export class AccountRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: CreateAccountData): Promise<Account> {
    return this.prisma.account.create({
      data,
    });
  }

  findById(id: string): Promise<Account | null> {
    return this.prisma.account.findUnique({
      where: { id },
    });
  }

  findByBranch(branchId: string): Promise<Account[]> {
    return this.prisma.account.findMany({
      where: { branchId },
      orderBy: { openedAt: 'desc' },
    });
  }

  findByBranchAndStatus(
    branchId: string,
    status: AccountStatus,
  ): Promise<Account[]> {
    return this.prisma.account.findMany({
      where: { branchId, status },
      orderBy: { openedAt: 'desc' },
    });
  }

  findOpenByBranch(branchId: string): Promise<Account[]> {
    return this.prisma.account.findMany({
      where: {
        branchId,
        status: AccountStatus.OPEN,
      },
      orderBy: { openedAt: 'desc' },
    });
  }

  findByTable(tableId: string): Promise<Account[]> {
    return this.prisma.account.findMany({
      where: { tableId },
      orderBy: { openedAt: 'desc' },
    });
  }

  findByCustomer(customerId: string): Promise<Account[]> {
    return this.prisma.account.findMany({
      where: { customerId },
      orderBy: { openedAt: 'desc' },
    });
  }

  update(
    id: string,
    data: UpdateAccountData,
  ): Promise<Account> {
    return this.prisma.account.update({
      where: { id },
      data,
    });
  }

  updateStatus(
    id: string,
    status: AccountStatus,
  ): Promise<Account> {
    return this.prisma.account.update({
      where: { id },
      data: { status },
    });
  }

  close(id: string): Promise<Account> {
    return this.prisma.account.update({
      where: { id },
      data: {
        status: AccountStatus.CLOSED,
        closedAt: new Date(),
      },
    });
  }
}
