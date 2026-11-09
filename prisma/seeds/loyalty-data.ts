import { PrismaClient, UserRole } from '../../src/generated/prisma/client.js';

export const LOYALTY_RULE_ID = '70000000-0000-4000-8000-000000000001';

export async function seedLoyaltyData(prisma: PrismaClient) {
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({
      where: { email: 'demo@example.com' },
    });
    if (user.role !== UserRole.CLIENT)
      throw new Error('La cuenta demo del seed debe tener el rol CLIENT.');

    await tx.pointsRule.upsert({
      where: { id: LOYALTY_RULE_ID },
      update: {},
      create: {
        id: LOYALTY_RULE_ID,
        pointsPerDollar: '1.00',
        startsAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    });
    const history = await tx.pointsMovement.aggregate({
      where: { customerId: user.id },
      _sum: { points: true },
    });
    // Solo inicializa cuentas faltantes; repetir el seed no reinicia saldos.
    await tx.loyaltyAccount.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id, points: history._sum.points ?? 0 },
    });
  });
}
