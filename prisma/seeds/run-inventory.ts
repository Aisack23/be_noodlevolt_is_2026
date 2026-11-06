import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { seedBaseData } from './base-data.js';
import { seedInventoryData } from './inventory-data.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
try {
  await seedBaseData(prisma);
  await seedInventoryData(prisma);
  process.stdout.write('Datos base e inventario de insumos listos.\n');
} finally {
  await prisma.$disconnect();
}
