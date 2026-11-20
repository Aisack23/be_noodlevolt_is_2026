import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { seedBaseData } from './base-data.js';
import { seedCatalogData } from './catalog-data.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
try {
  await seedBaseData(prisma);
  await seedCatalogData(prisma);
  process.stdout.write('Datos base y catálogo listos.\n');
} finally {
  await prisma.$disconnect();
}
