
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { ReviewAlreadyExistsError } from '@CustomerFeatures/errors';
import { Prisma, type Review } from '@PrismaClient';

const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

export interface CreateReviewData {
  orderId: string;
  customerId: string;
  branchId: string;
  rating: number;
  comment?: string | null;
}

export interface UpdateReviewData {
  rating?: number;
  comment?: string | null;
}

@Injectable()
export class ReviewRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateReviewData): Promise<Review> {
    try {
      return await this.prisma.review.create({ data });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === UNIQUE_CONSTRAINT_VIOLATION
      ) {
        throw new ReviewAlreadyExistsError(data.orderId);
      }
      throw error;
    }
  }

  findById(id: string): Promise<Review | null> {
    return this.prisma.review.findUnique({
      where: { id },
    });
  }

  findByOrder(orderId: string): Promise<Review | null> {
    return this.prisma.review.findUnique({
      where: { orderId },
    });
  }

  aggregateByBranch(branchId: string): Promise<{
    _avg: { rating: number | null };
    _count: { _all: number };
  }> {
    return this.prisma.review.aggregate({
      where: { branchId },
      _avg: { rating: true },
      _count: { _all: true },
    });
  }

  findByCustomer(customerId: string): Promise<Review[]> {
    return this.prisma.review.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
    });
  }

  findByBranch(branchId: string): Promise<Review[]> {
    return this.prisma.review.findMany({
      where: { branchId },
      orderBy: { createdAt: 'desc' },
    });
  }

  findByBranchAndRating(
    branchId: string,
    rating: number,
  ): Promise<Review[]> {
    return this.prisma.review.findMany({
      where: { branchId, rating },
      orderBy: { createdAt: 'desc' },
    });
  }

  findByBranchAndDateRange(
    branchId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<Review[]> {
    return this.prisma.review.findMany({
      where: {
        branchId,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  update(id: string, data: UpdateReviewData): Promise<Review> {
    return this.prisma.review.update({
      where: { id },
      data,
    });
  }
}
