import { Prisma, type PrismaClient } from '../../src/generated/prisma/client.js';
import { BASE_BRANCHES } from './base-data.js';

const DEMO_EMAIL = 'demo@example.com';

const SALES_REPORT_CASES = [
  {
    branchName: 'NoodleVolt Centro',
    orderId: 'd1000000-0000-4000-8000-000000000001',
    paymentId: 'd2000000-0000-4000-8000-000000000001',
    operationId: 'd3000000-0000-4000-8000-000000000001',
    orderNumber: 'DB10-C-001',
    orderStatus: 'DELIVERED',
    paymentStatus: 'PAID',
    amount: '12.75',
    createdAt: '2026-01-15T06:00:00.000Z',
  },
  {
    branchName: 'NoodleVolt Centro',
    orderId: 'd1000000-0000-4000-8000-000000000002',
    paymentId: 'd2000000-0000-4000-8000-000000000002',
    operationId: 'd3000000-0000-4000-8000-000000000002',
    orderNumber: 'DB10-C-002',
    orderStatus: 'DELIVERED',
    paymentStatus: 'PAID',
    amount: '0.99',
    createdAt: '2026-01-16T05:59:59.000Z',
  },
  {
    branchName: 'NoodleVolt Centro',
    orderId: 'd1000000-0000-4000-8000-000000000003',
    paymentId: 'd2000000-0000-4000-8000-000000000003',
    operationId: 'd3000000-0000-4000-8000-000000000003',
    orderNumber: 'DB10-C-003',
    orderStatus: 'DELIVERED',
    paymentStatus: 'PAID',
    amount: '2.50',
    createdAt: '2026-01-16T06:00:00.000Z',
  },
  {
    branchName: 'NoodleVolt Centro',
    orderId: 'd1000000-0000-4000-8000-000000000004',
    paymentId: 'd2000000-0000-4000-8000-000000000004',
    operationId: 'd3000000-0000-4000-8000-000000000004',
    orderNumber: 'DB10-C-004',
    orderStatus: 'DELIVERED',
    paymentStatus: 'PAID',
    amount: '1.10',
    createdAt: '2026-01-16T02:30:00.000Z',
  },
  {
    branchName: 'NoodleVolt Centro',
    orderId: 'd1000000-0000-4000-8000-000000000005',
    paymentId: 'd2000000-0000-4000-8000-000000000005',
    operationId: 'd3000000-0000-4000-8000-000000000005',
    orderNumber: 'DB10-C-005',
    orderStatus: 'DELIVERED',
    paymentStatus: 'REJECTED',
    amount: '9.99',
    createdAt: '2026-01-15T18:00:00.000Z',
  },
  {
    branchName: 'NoodleVolt Centro',
    orderId: 'd1000000-0000-4000-8000-000000000006',
    paymentId: 'd2000000-0000-4000-8000-000000000006',
    operationId: 'd3000000-0000-4000-8000-000000000006',
    orderNumber: 'DB10-C-006',
    orderStatus: 'CANCELED',
    paymentStatus: 'PAID',
    amount: '19.99',
    createdAt: '2026-01-15T19:00:00.000Z',
  },
  {
    branchName: 'NoodleVolt Santa Tecla',
    orderId: 'd1000000-0000-4000-8000-000000000007',
    paymentId: 'd2000000-0000-4000-8000-000000000007',
    operationId: 'd3000000-0000-4000-8000-000000000007',
    orderNumber: 'DB10-S-001',
    orderStatus: 'DELIVERED',
    paymentStatus: 'PAID',
    amount: '3.50',
    createdAt: '2026-01-15T12:00:00.000Z',
  },
  {
    branchName: 'NoodleVolt Santa Tecla',
    orderId: 'd1000000-0000-4000-8000-000000000008',
    paymentId: 'd2000000-0000-4000-8000-000000000008',
    operationId: 'd3000000-0000-4000-8000-000000000008',
    orderNumber: 'DB10-S-002',
    orderStatus: 'DELIVERED',
    paymentStatus: 'REJECTED',
    amount: '4.25',
    createdAt: '2026-01-15T13:00:00.000Z',
  },
] as const;

export async function seedSalesReportData(prisma: PrismaClient) {
  const customer = await prisma.user.findUniqueOrThrow({
    where: { email: DEMO_EMAIL },
  });
  const branchIds = new Map<string, string>();

  for (const { name } of BASE_BRANCHES) {
    const branch = await prisma.branch.findUniqueOrThrow({ where: { name } });
    branchIds.set(branch.name, branch.id);
  }

  await prisma.$transaction(async (tx) => {
    for (const seedCase of SALES_REPORT_CASES) {
      const branchId = branchIds.get(seedCase.branchName);
      if (!branchId)
        throw new Error(`Sucursal del seed inexistente: ${seedCase.branchName}`);

      const amount = new Prisma.Decimal(seedCase.amount);
      const createdAt = new Date(seedCase.createdAt);
      const order = await tx.order.upsert({
        where: { id: seedCase.orderId },
        update: {
          branchId,
          customerId: customer.id,
          orderNumber: seedCase.orderNumber,
          type: 'TAKEOUT',
          paymentMode: 'ONLINE',
          status: seedCase.orderStatus,
          operationId: seedCase.operationId,
          total: amount,
        },
        create: {
          id: seedCase.orderId,
          branchId,
          customerId: customer.id,
          orderNumber: seedCase.orderNumber,
          type: 'TAKEOUT',
          paymentMode: 'ONLINE',
          status: seedCase.orderStatus,
          operationId: seedCase.operationId,
          total: amount,
        },
      });

      await tx.payment.upsert({
        where: { id: seedCase.paymentId },
        update: {
          branchId,
          orderId: order.id,
          subtotal: amount,
          totalPaid:
            seedCase.paymentStatus === 'PAID'
              ? amount
              : new Prisma.Decimal(0),
          status: seedCase.paymentStatus,
          createdAt,
        },
        create: {
          id: seedCase.paymentId,
          branchId,
          orderId: order.id,
          subtotal: amount,
          totalPaid:
            seedCase.paymentStatus === 'PAID'
              ? amount
              : new Prisma.Decimal(0),
          status: seedCase.paymentStatus,
          createdAt,
        },
      });
    }
  });
}

export const salesReportSeedCases = SALES_REPORT_CASES;
