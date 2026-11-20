import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { seedBaseData } from './base-data.js';
import { seedBranchConfigData } from './branch-config-data.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
try {
  await seedBaseData(prisma);
  await seedBranchConfigData(prisma);
  process.stdout.write('Datos base y estado de sucursales listos.\n');
} finally {
  await prisma.$disconnect();
}
