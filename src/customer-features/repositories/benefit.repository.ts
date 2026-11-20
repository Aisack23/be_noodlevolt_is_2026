
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { Benefit, Prisma } from '@PrismaClient';

export interface CreateBenefitData {
  name: string;
  description?: string | null;
  pointsCost: number;
  discount?: Prisma.Decimal | number;
  isActive?: boolean;
}

export interface UpdateBenefitData {
  name?: string;
  description?: string | null;
  pointsCost?: number;
  discount?: Prisma.Decimal | number;
}

@Injectable()
export class BenefitRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: CreateBenefitData): Promise<Benefit> {
    return this.prisma.benefit.create({ data });
  }

  findById(id: string): Promise<Benefit | null> {
    return this.prisma.benefit.findUnique({
      where: { id },
    });
  }

  findAll(): Promise<Benefit[]> {
    return this.prisma.benefit.findMany({
      orderBy: { name: 'asc' },
    });
  }

  findActive(): Promise<Benefit[]> {
    return this.prisma.benefit.findMany({
      where: { isActive: true },
      orderBy: { pointsCost: 'asc' },
    });
  }

  update(id: string, data: UpdateBenefitData): Promise<Benefit> {
    return this.prisma.benefit.update({
      where: { id },
      data,
    });
  }

  setActive(id: string, isActive: boolean): Promise<Benefit> {
    return this.prisma.benefit.update({
      where: { id },
      data: { isActive },
    });
  }
}
