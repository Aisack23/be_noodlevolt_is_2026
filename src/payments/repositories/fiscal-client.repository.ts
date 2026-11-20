import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { FiscalClient } from '@PrismaClient';

export interface CreateFiscalClientData {
  taxpayerName: string;
  duiNit: string;
  nrc?: string | null;
  address?: string | null;
}

export interface UpdateFiscalClientData {
  taxpayerName?: string;
  duiNit?: string;
  nrc?: string | null;
  address?: string | null;
}

@Injectable()
export class FiscalClientRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: CreateFiscalClientData): Promise<FiscalClient> {
    return this.prisma.fiscalClient.create({ data });
  }

  findById(id: string): Promise<FiscalClient | null> {
    return this.prisma.fiscalClient.findUnique({
      where: { id },
    });
  }

  findByDuiNit(duiNit: string): Promise<FiscalClient | null> {
    return this.prisma.fiscalClient.findUnique({
      where: { duiNit },
    });
  }

  findAll(): Promise<FiscalClient[]> {
    return this.prisma.fiscalClient.findMany({
      orderBy: { taxpayerName: 'asc' },
    });
  }

  update(
    id: string,
    data: UpdateFiscalClientData,
  ): Promise<FiscalClient> {
    return this.prisma.fiscalClient.update({
      where: { id },
      data,
    });
  }
}