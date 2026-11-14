import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { seedRewardProducts } from './reward-products-data.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
try {
  await seedRewardProducts(prisma);
  process.stdout.write(
    'Productos de recompensas preparados en las sucursales activas.\n',
  );
} finally {
  await prisma.$disconnect();
}
