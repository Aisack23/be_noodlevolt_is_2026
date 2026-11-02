
import { Injectable } from '@nestjs/common';
import {
  FiscalDocument,
  FiscalDocumentType,
  Prisma,
} from '@PrismaClient';
import { PrismaService } from '@Prisma/services';

export interface CreateFiscalDocumentData {
  paymentId: string;
  documentType: FiscalDocumentType;
  documentNumber: string;
  fiscalClientId?: string | null;
  issuedAt?: Date;
  issuerData?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
  receiverData?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
}

export interface UpdateFiscalDocumentData {
  documentType?: FiscalDocumentType;
  documentNumber?: string;
  fiscalClientId?: string | null;
  issuerData?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
  receiverData?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
}

@Injectable()
export class FiscalDocumentRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: CreateFiscalDocumentData): Promise<FiscalDocument> {
    return this.prisma.fiscalDocument.create({
      data,
    });
  }

  findById(id: string): Promise<FiscalDocument | null> {
    return this.prisma.fiscalDocument.findUnique({
      where: { id },
    });
  }

  findByPayment(paymentId: string): Promise<FiscalDocument | null> {
    return this.prisma.fiscalDocument.findUnique({
      where: { paymentId },
    });
  }

  findByDocumentNumber(
    documentNumber: string,
  ): Promise<FiscalDocument | null> {
    return this.prisma.fiscalDocument.findUnique({
      where: { documentNumber },
    });
  }

  findByFiscalClient(fiscalClientId: string): Promise<FiscalDocument[]> {
    return this.prisma.fiscalDocument.findMany({
      where: { fiscalClientId },
      orderBy: { issuedAt: 'desc' },
    });
  }

  findByType(
    documentType: FiscalDocumentType,
  ): Promise<FiscalDocument[]> {
    return this.prisma.fiscalDocument.findMany({
      where: { documentType },
      orderBy: { issuedAt: 'desc' },
    });
  }

  findByDateRange(
    startDate: Date,
    endDate: Date,
  ): Promise<FiscalDocument[]> {
    return this.prisma.fiscalDocument.findMany({
      where: {
        issuedAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: { issuedAt: 'desc' },
    });
  }

  update(
    id: string,
    data: UpdateFiscalDocumentData,
  ): Promise<FiscalDocument> {
    return this.prisma.fiscalDocument.update({
      where: { id },
      data,
    });
  }
}
