import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '../../src/generated/prisma/client.js';
import { BASE_BRANCHES } from './base-data.js';

const DEMO_EMAIL = 'demo@example.com';
const BRANCH_NAMES = BASE_BRANCHES.map(({ name }) => name);

const REVIEW_CASES = [
  {
    branchName: BRANCH_NAMES[0],
    orderNumber: '1001',
    status: 'DELIVERED',
    hasReview: true,
    rating: 5,
    comment: 'Excelente atención y ramen.',
  },
  {
    branchName: BRANCH_NAMES[0],
    orderNumber: '1002',
    status: 'DELIVERED',
    hasReview: false,
  },
  {
    branchName: BRANCH_NAMES[0],
    orderNumber: '1003',
    status: 'PENDING',
    hasReview: false,
  },
  {
    branchName: BRANCH_NAMES[1],
    orderNumber: '2001',
    status: 'DELIVERED',
    hasReview: true,
    rating: 4,
    comment: 'Buen sabor, podría mejorar la puntualidad.',
  },
  {
    branchName: BRANCH_NAMES[1],
    orderNumber: '2002',
    status: 'DELIVERED',
    hasReview: false,
  },
  {
    branchName: BRANCH_NAMES[1],
    orderNumber: '2003',
    status: 'PENDING',
    hasReview: false,
  },
] as const;

type ReviewCase = (typeof REVIEW_CASES)[number];

function getExpectedOrderStatusCounts() {
  return {
    deliveredWithReview: 2,
    deliveredWithoutReview: 2,
    pending: 2,
  };
}

export async function seedReviewData(prisma: PrismaClient) {
  const customer = await prisma.user.findUniqueOrThrow({
    where: { email: DEMO_EMAIL },
  });

  await prisma.$transaction(async (tx) => {
    for (const branchName of BRANCH_NAMES) {
      const branch = await tx.branch.findUniqueOrThrow({
        where: { name: branchName },
      });

      for (const seedCase of REVIEW_CASES.filter(
        (caseItem) => caseItem.branchName === branchName,
      )) {
        const order = await tx.order.upsert({
          where: {
            branchId_orderNumber: {
              branchId: branch.id,
              orderNumber: seedCase.orderNumber,
            },
          },
          update: {
            customerId: customer.id,
            status: seedCase.status,
            total: new Prisma.Decimal('0'),
          },
          create: {
            branchId: branch.id,
            customerId: customer.id,
            orderNumber: seedCase.orderNumber,
            type: 'DINE_IN',
            status: seedCase.status,
            operationId: randomUUID(),
            total: new Prisma.Decimal('0'),
          },
        });

        if (seedCase.hasReview) {
          await tx.review.upsert({
            where: { orderId: order.id },
            update: {
              customerId: customer.id,
              branchId: branch.id,
              rating: seedCase.rating ?? 5,
              comment: seedCase.comment ?? null,
            },
            create: {
              orderId: order.id,
              customerId: customer.id,
              branchId: branch.id,
              rating: seedCase.rating ?? 5,
              comment: seedCase.comment ?? null,
            },
          });
        } else {
          await tx.review.deleteMany({
            where: { orderId: order.id },
          });
        }
      }
    }
  });

  const rows = await prisma.order.findMany({
    where: {
      customerId: customer.id,
      orderNumber: { in: REVIEW_CASES.map(({ orderNumber }) => orderNumber) },
    },
    include: { review: true },
  });

  const counts = {
    deliveredWithReview: rows.filter(
      (order) =>
        order.status === 'DELIVERED' && order.review !== null &&
        order.review !== undefined,
    ).length,
    deliveredWithoutReview: rows.filter(
      (order) =>
        order.status === 'DELIVERED' && order.review === null,
    ).length,
    pending: rows.filter((order) => order.status === 'PENDING').length,
  };

  const expected = getExpectedOrderStatusCounts();
  if (JSON.stringify(counts) !== JSON.stringify(expected)) {
    throw new Error(
      `Seed de reseñas inválida. Esperado ${JSON.stringify(expected)} pero se encontró ${JSON.stringify(counts)}.`,
    );
  }

  const branchCounts = await prisma.order.groupBy({
    by: ['branchId'],
    _count: { id: true },
    where: {
      customerId: customer.id,
      orderNumber: { in: REVIEW_CASES.map(({ orderNumber }) => orderNumber) },
    },
  });

  if (branchCounts.length !== BRANCH_NAMES.length) {
    throw new Error(
      `La seed debe generar pedidos para las ${BRANCH_NAMES.length} sucursales. Encontradas: ${branchCounts.length}.`,
    );
  }
}

export const reviewSeedCases: readonly ReviewCase[] = REVIEW_CASES;
