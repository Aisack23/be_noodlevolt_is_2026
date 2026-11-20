import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { seedBaseData } from './base-data.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
try {
  await seedBaseData(prisma);
  process.stdout.write('Datos base listos.\n');
} finally {
  await prisma.$disconnect();
}
