import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { seedBaseData } from './base-data.js';
import { seedBranchConfigData } from './branch-config-data.js';
import { seedCatalogData } from './catalog-data.js';
import { seedInventoryData } from './inventory-data.js';
import { seedLoyaltyData } from './loyalty-data.js';
import { seedNotificationData } from './notification-data.js';
import { seedReviewData } from './review-data.js';
import { seedRewardProducts } from './reward-products-data.js';
import { seedSalesReportData } from './sales-report-data.js';

if (process.env.ALLOW_DEMO_SEED !== 'true')
  throw new Error('Define ALLOW_DEMO_SEED=true únicamente para la base de demostración.');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

try {
  await seedBaseData(prisma);
  await seedCatalogData(prisma);
  await seedRewardProducts(prisma);
  await seedBranchConfigData(prisma);
  await seedInventoryData(prisma);
  await seedReviewData(prisma);
  await seedLoyaltyData(prisma);
  await seedNotificationData(prisma);
  await seedSalesReportData(prisma);
  console.log('Datos de demostración de la release cargados.');
} finally {
  await prisma.$disconnect();
}
