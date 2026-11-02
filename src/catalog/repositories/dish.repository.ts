import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { type Dish, type DishStatus } from '@PrismaClient';

export interface CreateDishData {
  branchId: string;
  categoryId: string;
  name: string;
  description?: string;
  price: number;
  imageUrl?: string;
  status?: DishStatus;
}

export interface UpdateDishData {
  categoryId?: string;
  name?: string;
  description?: string;
  price?: number;
  imageUrl?: string;
  status?: DishStatus;
}

@Injectable()
export class DishRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: CreateDishData): Promise<Dish> {
    return this.prisma.dish.create({
      data,
    });
  }

  findById(id: string): Promise<Dish | null> {
    return this.prisma.dish.findUnique({
      where: { id },
    });
  }

  findByCategory(categoryId: string): Promise<Dish[]> {
    return this.prisma.dish.findMany({
      where: { categoryId },
      orderBy: { name: 'asc' },
    });
  }

  findByStatus(status: DishStatus): Promise<Dish[]> {
    return this.prisma.dish.findMany({
      where: { status },
      orderBy: { name: 'asc' },
    });
  }

  findAvailableByCategory(categoryId: string): Promise<Dish[]> {
    return this.prisma.dish.findMany({
      where: {
        categoryId,
        status: 'AVAILABLE',
      },
      orderBy: { name: 'asc' },
    });
  }

  findAll(): Promise<Dish[]> {
    return this.prisma.dish.findMany({
      orderBy: { name: 'asc' },
    });
  }

  update(id: string, data: UpdateDishData): Promise<Dish> {
    return this.prisma.dish.update({
      where: { id },
      data,
    });
  }

  updateStatus(id: string, status: DishStatus): Promise<Dish> {
    return this.prisma.dish.update({
      where: { id },
      data: { status },
    });
  }
}
