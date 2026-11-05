import { PrismaClient } from '../../src/generated/prisma/client.js';
import type { DishStatus } from '../../src/generated/prisma/client.js';
import { BASE_BRANCHES } from './base-data.js';

interface SeedDish {
  name: string;
  category: string;
  price: string;
  priceByBranch?: Readonly<Record<string, string>>;
  status?: DishStatus;
  isAvailable?: boolean;
}

const CATEGORIES = [
  { name: 'Entradas', displayOrder: 1 },
  { name: 'Platos fuertes', displayOrder: 2 },
  { name: 'Bebidas', displayOrder: 3 },
  { name: 'Postres', displayOrder: 4 },
];
const DISHES: readonly SeedDish[] = [
  { name: 'Rollitos primavera', category: 'Entradas', price: '4.50' },
  { name: 'Gyozas de vegetales', category: 'Entradas', price: '5.00' },
  { name: 'Ramen de pollo', category: 'Platos fuertes', price: '8.50' },
  { name: 'Noodles de vegetales', category: 'Platos fuertes', price: '7.50' },
  { name: 'Té helado', category: 'Bebidas', price: '2.00' },
  { name: 'Limonada', category: 'Bebidas', price: '2.50' },
  { name: 'Mochi', category: 'Postres', price: '3.50' },
  { name: 'Flan de coco', category: 'Postres', price: '3.00' },
  {
    name: 'Arroz frito',
    category: 'Platos fuertes',
    price: '6.50',
    priceByBranch: { 'NoodleVolt Santa Tecla': '7.00' },
  },
  {
    name: 'Sopa wonton',
    category: 'Entradas',
    price: '4.00',
    status: 'DISABLED',
    isAvailable: false,
  },
];

export async function seedCatalogData(prisma: PrismaClient) {
  await prisma.$transaction(async (tx) => {
    for (const { name: branchName } of BASE_BRANCHES) {
      const branch = await tx.branch.findUniqueOrThrow({
        where: { name: branchName },
      });
      const categories = new Map<string, string>();
      for (const { name, displayOrder } of CATEGORIES) {
        const category = await tx.category.upsert({
          where: { branchId_name: { branchId: branch.id, name } },
          update: { displayOrder },
          create: { branchId: branch.id, name, displayOrder },
        });
        categories.set(name, category.id);
      }
      for (const dish of DISHES) {
        const categoryId = categories.get(dish.category);
        if (!categoryId)
          throw new Error(`Categoría del seed inexistente: ${dish.category}`);
        await tx.dish.upsert({
          where: { branchId_name: { branchId: branch.id, name: dish.name } },
          update: {},
          create: {
            branchId: branch.id,
            categoryId,
            name: dish.name,
            price: dish.priceByBranch?.[branchName] ?? dish.price,
            status: dish.status,
            isAvailable: dish.isAvailable,
          },
        });
      }
    }
  });
}
