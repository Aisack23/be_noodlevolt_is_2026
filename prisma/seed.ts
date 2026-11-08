import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { seedBaseData } from './seeds/base-data.js';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  await seedBaseData(prisma);
  console.log('Datos base listos.');
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
