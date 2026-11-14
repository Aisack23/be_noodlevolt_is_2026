import type { PrismaClient } from '../../src/generated/prisma/client.js';

const products = [
  { name: 'Salsa extra', price: '0.75' },
  { name: 'Wantanes', price: '3.00' },
  { name: 'Rollitos primavera', price: '4.50' },
];

export async function seedRewardProducts(prisma: PrismaClient) {
  await prisma.$transaction(
    async (tx) => {
      const branches = await tx.branch.findMany({
        where: { isActive: true },
        select: { id: true },
        orderBy: { id: 'asc' },
      });
      for (const branch of branches) {
        const category = await tx.category.upsert({
          where: { branchId_name: { branchId: branch.id, name: 'Entradas' } },
          update: {},
          create: { branchId: branch.id, name: 'Entradas', displayOrder: 1 },
        });
        for (const product of products) {
          await tx.dish.upsert({
            where: {
              branchId_name: { branchId: branch.id, name: product.name },
            },
            update: {},
            create: {
              ...product,
              branchId: branch.id,
              categoryId: category.id,
            },
          });
        }
      }
    },
    { timeout: 30000 },
  );
}
