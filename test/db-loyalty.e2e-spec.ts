import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { seedBaseData } from '../prisma/seeds/base-data.js';
import {
  LOYALTY_RULE_ID,
  seedLoyaltyData,
} from '../prisma/seeds/loyalty-data.js';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { databaseFixture } from './support/database.js';

describe.sequential('DB-07: cuentas y movimientos de lealtad', () => {
  const db = databaseFixture();

  async function user() {
    const id = randomUUID();
    await db.client.query(
      `INSERT INTO users (id,email,name,password_hash,updated_at)
       VALUES ($1,$2,'Lealtad','test',now())`,
      [id, `${id}@example.com`],
    );
    return id;
  }
  async function payment() {
    const id = randomUUID();
    await db.client.query(
      `INSERT INTO payments (id,branch_id,subtotal,total_paid,status)
       VALUES ($1,$2,8.75,8.75,'PAID')`,
      [id, db.branches[0]],
    );
    return id;
  }
  function account(userId: string | null, points = 0) {
    return db.client.query(
      'INSERT INTO loyalty_accounts (user_id,points) VALUES ($1,$2)',
      [userId, points],
    );
  }
  function movement(
    customerId: string,
    points: number,
    paymentId: string | null = null,
    type = 'EARN',
  ) {
    return db.client.query(
      'INSERT INTO points_movements (id,customer_id,type,points,payment_id) VALUES ($1,$2,$3,$4,$5)',
      [randomUUID(), customerId, type, points, paymentId],
    );
  }

  it('inicializa el saldo en cero y conserva fechas TIMESTAMPTZ', async () => {
    const id = await user();
    await db.client.query(
      'INSERT INTO loyalty_accounts (user_id) VALUES ($1)',
      [id],
    );
    const { rows } = await db.client.query<{
      points: number;
      created_at: Date;
      updated_at: Date;
    }>(
      'SELECT points,created_at,updated_at FROM loyalty_accounts WHERE user_id=$1',
      [id],
    );
    expect(rows[0].points).toBe(0);
    expect(rows[0].created_at).toBeInstanceOf(Date);
    expect(rows[0].updated_at).toBeInstanceOf(Date);
    const columns = await db.client.query<{ data_type: string }>(
      `SELECT data_type FROM information_schema.columns WHERE table_schema='public'
       AND table_name='loyalty_accounts' AND column_name IN ('created_at','updated_at')`,
    );
    expect(columns.rows).toEqual([
      { data_type: 'timestamp with time zone' },
      { data_type: 'timestamp with time zone' },
    ]);
  });
  it('impide dos cuentas para el mismo usuario', async () => {
    const id = await user();
    await account(id);
    await db.rejectWrite(() => account(id), '23505', 'loyalty_accounts_pkey');
    await account(await user());
  });
  it('rechaza saldos negativos tanto al insertar como al actualizar', async () => {
    const id = await user();
    await db.rejectWrite(
      () => account(id, -1),
      '23514',
      'loyalty_accounts_points_nonnegative',
    );
    await account(id);
    await db.rejectWrite(
      () =>
        db.client.query(
          'UPDATE loyalty_accounts SET points=-1 WHERE user_id=$1',
          [id],
        ),
      '23514',
      'loyalty_accounts_points_nonnegative',
    );
  });
  it('exige usuario existente, no nulo y conserva la cuenta al intentar eliminarlo', async () => {
    await db.rejectWrite(
      () => account(randomUUID()),
      '23503',
      'loyalty_accounts_user_id_fkey',
    );
    await db.rejectWrite(() => account(null), '23502');
    const id = await user();
    await account(id);
    await db.rejectWrite(
      () => db.client.query('DELETE FROM users WHERE id=$1', [id]),
      '23001',
      'loyalty_accounts_user_id_fkey',
    );
  });
  it.each([0, -1])(
    'rechaza EARN de %i puntos y permite canjes con signo',
    async (points) => {
      const id = await user();
      await db.rejectWrite(
        () => movement(id, points),
        '23514',
        'points_movements_earn_positive',
      );
      await movement(id, -2, null, 'REDEEM');
      await movement(id, -1, null, 'ADJUSTMENT');
    },
  );
  it('al duplicar un pago rechaza el movimiento y revierte el incremento del saldo', async () => {
    const id = await user();
    const paymentId = await payment();
    await account(id, 8);
    await movement(id, 8, paymentId);
    await db.rejectWrite(
      async () => {
        await db.client.query(
          'UPDATE loyalty_accounts SET points=points+8 WHERE user_id=$1',
          [id],
        );
        await movement(id, 8, paymentId);
      },
      '23505',
      'points_movements_one_earn_per_payment',
    );
    const balance = await db.client.query<{ points: number }>(
      'SELECT points FROM loyalty_accounts WHERE user_id=$1',
      [id],
    );
    const history = await db.client.query(
      'SELECT id FROM points_movements WHERE payment_id=$1',
      [paymentId],
    );
    expect(balance.rows[0].points).toBe(8);
    expect(history.rows).toHaveLength(1);
    await db.rejectWrite(
      () => db.client.query('DELETE FROM payments WHERE id=$1', [paymentId]),
      '23001',
      'points_movements_payment_id_fkey',
    );
  });
  it('la unicidad es global por pago y parcial por EARN', async () => {
    const id = await user();
    const paymentId = await payment();
    await movement(id, 8, paymentId);
    const another = await user();
    await db.rejectWrite(
      () => movement(another, 8, paymentId),
      '23505',
      'points_movements_one_earn_per_payment',
    );
    await movement(id, -1, paymentId, 'ADJUSTMENT');
    await movement(id, -2, paymentId, 'REDEEM');
    await movement(id, 4, await payment());
    await movement(id, 1);
    await movement(id, 1);
  });
  it('conserva las FK de cliente y pago del movimiento', async () => {
    await db.rejectWrite(
      () => movement(randomUUID(), 1),
      '23503',
      'points_movements_customer_id_fkey',
    );
    const id = await user();
    await db.rejectWrite(
      () => movement(id, 1, randomUUID()),
      '23503',
      'points_movements_payment_id_fkey',
    );
    await movement(id, 1);
    await db.rejectWrite(
      () => db.client.query('DELETE FROM users WHERE id=$1', [id]),
      '23001',
      'points_movements_customer_id_fkey',
    );
  });
});

describe.sequential('DB-07: seed idempotente con la cuenta demo real', () => {
  let prisma: PrismaClient;
  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    });
    await seedBaseData(prisma);
    await seedLoyaltyData(prisma);
  }, 30_000);
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('repetir el seed conserva saldos, fechas y regla modificados', async () => {
    const demo = await prisma.user.findUniqueOrThrow({
      where: { email: 'demo@example.com' },
    });
    const original = await prisma.loyaltyAccount.findUniqueOrThrow({
      where: { userId: demo.id },
    });
    const rule = await prisma.pointsRule.findUniqueOrThrow({
      where: { id: LOYALTY_RULE_ID },
    });
    const adjustmentId = randomUUID();
    try {
      await prisma.$transaction([
        prisma.pointsMovement.create({
          data: {
            id: adjustmentId,
            customerId: demo.id,
            type: 'ADJUSTMENT',
            points: 9,
          },
        }),
        prisma.loyaltyAccount.update({
          where: { userId: demo.id },
          data: {
            points: { increment: 9 },
            updatedAt: new Date('2026-02-01T00:00:00Z'),
          },
        }),
        prisma.pointsRule.update({
          where: { id: rule.id },
          data: { pointsPerDollar: '2.00', isActive: false },
        }),
      ]);
      const before = await prisma.loyaltyAccount.findUniqueOrThrow({
        where: { userId: demo.id },
      });
      const ruleBefore = await prisma.pointsRule.findUniqueOrThrow({
        where: { id: rule.id },
      });
      await seedLoyaltyData(prisma);
      await seedLoyaltyData(prisma);
      expect(
        await prisma.loyaltyAccount.findUniqueOrThrow({
          where: { userId: demo.id },
        }),
      ).toEqual(before);
      expect(
        await prisma.pointsRule.findUniqueOrThrow({ where: { id: rule.id } }),
      ).toEqual(ruleBefore);
      expect(
        await prisma.loyaltyAccount.count({ where: { userId: demo.id } }),
      ).toBe(1);
    } finally {
      await prisma.$transaction([
        prisma.pointsMovement.deleteMany({ where: { id: adjustmentId } }),
        prisma.loyaltyAccount.update({
          where: { userId: demo.id },
          data: { points: original.points, updatedAt: original.updatedAt },
        }),
        prisma.pointsRule.update({
          where: { id: rule.id },
          data: {
            pointsPerDollar: rule.pointsPerDollar,
            isActive: rule.isActive,
          },
        }),
      ]);
    }
  });
  it('inicializa una cuenta faltante con su historial y no acredita otra vez al repetir', async () => {
    const demo = await prisma.user.findUniqueOrThrow({
      where: { email: 'demo@example.com' },
    });
    const original = await prisma.loyaltyAccount.findUniqueOrThrow({
      where: { userId: demo.id },
    });
    const adjustmentId = randomUUID();
    try {
      await prisma.$transaction([
        prisma.loyaltyAccount.delete({ where: { userId: demo.id } }),
        prisma.pointsMovement.create({
          data: {
            id: adjustmentId,
            customerId: demo.id,
            type: 'ADJUSTMENT',
            points: 13,
          },
        }),
      ]);
      const history = await prisma.pointsMovement.aggregate({
        where: { customerId: demo.id },
        _sum: { points: true },
      });
      await seedLoyaltyData(prisma);
      const seeded = await prisma.loyaltyAccount.findUniqueOrThrow({
        where: { userId: demo.id },
      });
      expect(seeded.points).toBe(history._sum.points);
      await seedLoyaltyData(prisma);
      expect(
        await prisma.loyaltyAccount.findUniqueOrThrow({
          where: { userId: demo.id },
        }),
      ).toEqual(seeded);
    } finally {
      const data = {
        points: original.points,
        createdAt: original.createdAt,
        updatedAt: original.updatedAt,
      };
      await prisma.$transaction([
        prisma.pointsMovement.deleteMany({ where: { id: adjustmentId } }),
        prisma.loyaltyAccount.upsert({
          where: { userId: demo.id },
          create: original,
          update: data,
        }),
      ]);
    }
  });
  it('Prisma actualiza updatedAt al cambiar el saldo', async () => {
    await prisma.$transaction(async (tx) => {
      const id = randomUUID();
      await tx.user.create({
        data: {
          id,
          email: `${id}@example.com`,
          name: 'Auditoría',
          passwordHash: 'test',
        },
      });
      const old = new Date('2026-01-01T00:00:00Z');
      await tx.loyaltyAccount.create({ data: { userId: id, updatedAt: old } });
      const updated = await tx.loyaltyAccount.update({
        where: { userId: id },
        data: { points: 1 },
      });
      expect(updated.updatedAt.getTime()).toBeGreaterThan(old.getTime());
      await tx.loyaltyAccount.delete({ where: { userId: id } });
      await tx.user.delete({ where: { id } });
    });
  });
});
