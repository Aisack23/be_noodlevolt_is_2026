import { PageQueryDto } from '../../common/dto/page-query.dto.js';
import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import type { DiningTablesQueryDto } from '../dto/dining-query.dto.js';

const tableSelect = {
  id: true,
  branchId: true,
  number: true,
  capacity: true,
  status: true,
  roomId: true,
  room: { select: { id: true, name: true, isActive: true } },
} as const;

@Injectable()
export class DiningQueryRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  findBranch(id: string) {
    return this.prisma.branch.findUnique({
      where: { id },
      select: { id: true, isActive: true },
    });
  }

  findRoom(branchId: string, id: string) {
    return this.prisma.diningRoom.findFirst({
      where: { id, branchId },
      select: { id: true },
    });
  }

  async rooms(branchId: string, { page, limit }: PageQueryDto) {
    const where = { branchId };
    const [items, total] = await this.prisma.$transaction(
      [
        this.prisma.diningRoom.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            branchId: true,
            name: true,
            isActive: true,
            _count: { select: { tables: true } },
          },
        }),
        this.prisma.diningRoom.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return {
      items: items.map(({ _count, ...room }) => ({
        ...room,
        tableCount: _count.tables,
      })),
      total,
      page,
      limit,
    };
  }

  async tables(
    branchId: string,
    { page, limit, roomId, status }: DiningTablesQueryDto,
  ) {
    const where = { branchId, roomId, status };
    const [items, total] = await this.prisma.$transaction(
      [
        this.prisma.diningTable.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: [{ number: 'asc' }, { id: 'asc' }],
          select: tableSelect,
        }),
        this.prisma.diningTable.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return { items, total, page, limit };
  }

  table(branchId: string, id: string) {
    return this.prisma.diningTable.findFirst({
      where: { id, branchId },
      select: tableSelect,
    });
  }
}
