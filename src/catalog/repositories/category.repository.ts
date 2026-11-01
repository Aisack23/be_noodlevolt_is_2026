
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { type Category } from '@PrismaClient';

export interface CreateCategoryData {
  name: string;
  description?: string;
}

export interface UpdateCategoryData {
  name?: string;
  description?: string;
}

@Injectable()
export class CategoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: CreateCategoryData): Promise<Category> {
    return this.prisma.category.create({
      data,
    });
  }

  findById(id: string): Promise<Category | null> {
    return this.prisma.category.findUnique({
      where: { id },
    });
  }

  findByName(name: string): Promise<Category | null> {
    return this.prisma.category.findUnique({
      where: { name },
    });
  }

  findAll(): Promise<Category[]> {
    return this.prisma.category.findMany({
      orderBy: { name: 'asc' },
    });
  }

  findActive(): Promise<Category[]> {
    return this.prisma.category.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  update(id: string, data: UpdateCategoryData): Promise<Category> {
    return this.prisma.category.update({
      where: { id },
      data,
    });
  }

  setActive(id: string, isActive: boolean): Promise<Category> {
    return this.prisma.category.update({
      where: { id },
      data: { isActive },
    });
  }
}
