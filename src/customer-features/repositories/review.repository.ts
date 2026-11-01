
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { Review } from '@PrismaClient';

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

  create(data: CreateReviewData): Promise<Review> {
    return this.prisma.review.create({ data });
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
