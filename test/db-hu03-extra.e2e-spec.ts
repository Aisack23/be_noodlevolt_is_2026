import 'dotenv/config';
import { randomBytes, randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Client } from 'pg';
import request from 'supertest';
import { PrismaService } from '@Prisma/services';
import { UserRole } from '@PrismaClient';
import type { CreateRedemptionDto } from '../src/customer-features/rewards/reward.dto.js';

const branches = [randomUUID(), randomUUID()];
const rooms = [randomUUID(), randomUUID(), randomUUID()];
const tables = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
const customers = [randomUUID(), randomUUID()];
const orders = [randomUUID(), randomUUID(), randomUUID()];
const category = randomUUID();
const dish = randomUUID();
const customBenefit = randomUUID();
const rewardIds = [1, 2, 3, 4].map(
  (n) => `73000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
);
const roles = [
  UserRole.WAITER,
  UserRole.COOK,
  UserRole.CASHIER,
  UserRole.BRANCH_ADMIN,
  UserRole.GENERAL_MANAGER,
  UserRole.INVENTORY_MANAGER,
];
const staffIds = roles.map(() => randomUUID());

describe.sequential(
  'HU-03 extra: mesas, salones y canjes con PostgreSQL',
  () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let db: Client;
    let tokens: string[];
    let staff: Map<UserRole, string>;
    let fixtureReady = false;

    beforeAll(async () => {
      process.env.JWT_SECRET ??= randomBytes(32).toString('hex');
      const { AppModule } = await import('../src/app.module.js');
      const module = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      app = module.createNestApplication();
      app.setGlobalPrefix('api/v1');
      app.useGlobalPipes(
        new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: true,
          transform: true,
        }),
      );
      await app.init();
      prisma = module.get(PrismaService);
      db = new Client({ connectionString: process.env.DATABASE_URL });
      await db.connect();
      await prisma.$transaction(async (tx) => {
        await tx.branch.createMany({
          data: branches.map((id) => ({ id, name: id, address: 'HU03' })),
        });
        await tx.branchConfig.createMany({
          data: branches.map((branchId) => ({ branchId })),
        });
        await tx.diningRoom.createMany({
          data: [
            { id: rooms[0], branchId: branches[0], name: 'Principal' },
            {
              id: rooms[1],
              branchId: branches[0],
              name: 'Terraza',
              isActive: false,
            },
            { id: rooms[2], branchId: branches[1], name: 'Otro salón' },
          ],
        });
        await tx.diningTable.createMany({
          data: [
            {
              id: tables[0],
              branchId: branches[0],
              roomId: rooms[0],
              number: '1',
              capacity: 4,
            },
            {
              id: tables[1],
              branchId: branches[0],
              roomId: rooms[1],
              number: '2',
              capacity: 6,
              status: 'OCCUPIED',
            },
            {
              id: tables[2],
              branchId: branches[0],
              number: '3',
              capacity: 2,
              status: 'OUT_OF_SERVICE',
            },
            {
              id: tables[3],
              branchId: branches[1],
              roomId: rooms[2],
              number: '1',
              capacity: 4,
            },
          ],
        });
        await tx.user.createMany({
          data: [
            ...customers.map((id) => ({
              id,
              name: 'Cliente HU03',
              email: `${id}@example.com`,
              passwordHash: 'unused',
              role: UserRole.CLIENT,
            })),
            ...staffIds.map((id, i) => ({
              id,
              name: roles[i],
              email: `${id}@example.com`,
              passwordHash: 'unused',
              role: roles[i],
              branchId:
                roles[i] === UserRole.GENERAL_MANAGER ? null : branches[0],
            })),
          ],
        });
        await tx.category.create({
          data: { id: category, branchId: branches[0], name: 'Entradas HU03' },
        });
        await tx.dish.createMany({
          data: [
            {
              id: dish,
              branchId: branches[0],
              categoryId: category,
              name: 'Ramen HU03',
              price: '8.50',
            },
            ...['Salsa extra', 'Wantanes', 'Rollitos primavera'].map(
              (name) => ({
                branchId: branches[0],
                categoryId: category,
                name,
                price: '3.00',
              }),
            ),
          ],
        });
        await tx.benefit.create({
          data: {
            id: customBenefit,
            name: 'Wantanes personalizados',
            pointsCost: 25,
            rewardType: 'PRODUCT',
            productName: 'Wantanes',
          },
        });
      });
      fixtureReady = true;
      const jwt = module.get(JwtService);
      tokens = await Promise.all(
        customers.map((id) => jwt.signAsync({ sub: id })),
      );
      staff = new Map(
        await Promise.all(
          roles.map(
            async (role, i) =>
              [role, await jwt.signAsync({ sub: staffIds[i] })] as const,
          ),
        ),
      );
    });

    async function cleanOrders() {
      await prisma.pointsMovement.deleteMany({
        where: { customerId: { in: customers } },
      });
      await prisma.simpleReceipt.deleteMany({
        where: { payment: { order: { customerId: { in: customers } } } },
      });
      await prisma.payment.deleteMany({
        where: { order: { customerId: { in: customers } } },
      });
      await prisma.notification.deleteMany({
        where: { userId: { in: customers } },
      });
      await prisma.order.deleteMany({
        where: { customerId: { in: customers } },
      });
      await prisma.redemption.deleteMany({
        where: { customerId: { in: customers } },
      });
    }

    beforeEach(async () => {
      await cleanOrders();
      await prisma.loyaltyAccount.upsert({
        where: { userId: customers[0] },
        create: { userId: customers[0], points: 1000 },
        update: { points: 1000 },
      });
      await prisma.benefit.update({
        where: { id: customBenefit },
        data: {
          name: 'Wantanes personalizados',
          pointsCost: 25,
          isActive: true,
        },
      });
      await prisma.dish.updateMany({
        where: { branchId: branches[0] },
        data: { isAvailable: true },
      });
      await prisma.branch.update({
        where: { id: branches[0] },
        data: { isActive: true },
      });
      await prisma.branchConfig.update({
        where: { branchId: branches[0] },
        data: { isOpen: true },
      });
      for (const [i, id] of orders.entries())
        await prisma.order.create({
          data: {
            id,
            branchId: branches[0],
            customerId: customers[i === 2 ? 1 : 0],
            type: 'TAKEOUT',
            status: 'PENDING',
            paymentMode: 'ONLINE',
            total: '17.00',
            items: {
              create: {
                dishId: dish,
                dishName: 'Ramen HU03',
                quantity: 2,
                unitPrice: '8.50',
              },
            },
          },
        });
    });

    afterAll(async () => {
      try {
        if (fixtureReady) {
          await cleanOrders();
          await prisma.loyaltyAccount.deleteMany({
            where: { userId: { in: customers } },
          });
          await prisma.benefit.delete({ where: { id: customBenefit } });
          await prisma.user.deleteMany({
            where: { id: { in: [...customers, ...staffIds] } },
          });
          await prisma.dish.deleteMany({
            where: { branchId: { in: branches } },
          });
          await prisma.category.deleteMany({
            where: { branchId: { in: branches } },
          });
          await prisma.diningTable.deleteMany({
            where: { branchId: { in: branches } },
          });
          await prisma.branch.deleteMany({ where: { id: { in: branches } } });
        }
      } finally {
        if (db) await db.end();
        if (app) await app.close();
      }
    });

    const get = (path: string, token = tokens[0]) =>
      request(app.getHttpServer())
        .get(`/api/v1${path}`)
        .set('Authorization', `Bearer ${token}`);
    const dining = (
      suffix: string,
      token = staff.get(UserRole.WAITER)!,
      branchId: string = branches[0],
    ) => get(`/branches/${branchId}/${suffix}`, token);
    const input = (
      benefitId: string = rewardIds[0],
      orderId: string = orders[0],
    ): { benefitId: string; orderId: string; operationKey: string } => ({
      benefitId,
      orderId,
      operationKey: randomUUID(),
    });
    const redeem = (body: CreateRedemptionDto = input(), token = tokens[0]) =>
      request(app.getHttpServer())
        .post('/api/v1/loyalty/redemptions')
        .set('Authorization', `Bearer ${token}`)
        .send(body);
    const balance = async () =>
      (
        await prisma.loyaltyAccount.findUniqueOrThrow({
          where: { userId: customers[0] },
        })
      ).points;

    it('lista salones, filtra mesas, pagina y conserva el estado físico y los nulos válidos', async () => {
      const list = await dining('rooms').expect(200);
      expect(list.body).toMatchObject({ total: 2, page: 1, limit: 20 });
      expect(list.body.items[0]).toMatchObject({
        id: rooms[0],
        tableCount: 1,
        isActive: true,
      });
      expect(list.body.items[1]).toMatchObject({
        id: rooms[1],
        tableCount: 1,
        isActive: false,
      });
      const filtered = await dining(
        `tables?roomId=${rooms[0]}&status=AVAILABLE`,
      ).expect(200);
      expect(filtered.body.total).toBe(1);
      expect(filtered.body.items[0].id).toBe(tables[0]);
      expect(
        (await dining('tables?page=2&limit=1').expect(200)).body,
      ).toMatchObject({ total: 3, page: 2, limit: 1 });
      expect(
        (await dining(`tables/${tables[1]}`).expect(200)).body.status,
      ).toBe('OCCUPIED');
      expect(
        (await dining(`tables/${tables[2]}`).expect(200)).body,
      ).toMatchObject({ roomId: null, room: null });
      expect(
        (await dining('tables?status=RESERVED').expect(200)).body,
      ).toMatchObject({ items: [], total: 0 });
    });

    it('autoriza al personal operativo de la sucursal y al gerente general', async () => {
      for (const role of roles.filter(
        (role) => role !== UserRole.INVENTORY_MANAGER,
      )) {
        await dining('rooms', staff.get(role)).expect(200);
        await dining('tables', staff.get(role)).expect(200);
      }
      await dining(
        'tables',
        staff.get(UserRole.GENERAL_MANAGER),
        branches[1],
      ).expect(200);
      await dining(
        'tables',
        staff.get(UserRole.WAITER),
        branches[0].toUpperCase(),
      ).expect(200);
    });

    it('protege todos los endpoints sin sesión', async () => {
      for (const path of [
        `/branches/${branches[0]}/rooms`,
        `/branches/${branches[0]}/tables`,
        `/branches/${branches[0]}/tables/${tables[0]}`,
        '/loyalty/rewards',
        '/loyalty/redemptions/me',
      ]) {
        await request(app.getHttpServer()).get(`/api/v1${path}`).expect(401);
      }
      await request(app.getHttpServer())
        .post('/api/v1/loyalty/redemptions')
        .send(input())
        .expect(401);
    });

    it('rechaza roles sin permiso y sucursales ajenas', async () => {
      await dining('tables', tokens[0]).expect(403);
      await dining('rooms', staff.get(UserRole.INVENTORY_MANAGER)).expect(403);
      await dining('tables', staff.get(UserRole.WAITER), branches[1]).expect(
        403,
      );
      for (const role of roles) {
        await get('/loyalty/rewards', staff.get(role)).expect(403);
        await get('/loyalty/redemptions/me', staff.get(role)).expect(403);
        await redeem(input(), staff.get(role)).expect(403);
      }
    });

    it('valida UUID, filtros, paginación y evita inyección de propietario o coste', async () => {
      for (const suffix of [
        'tables?status=INVALID',
        'tables?roomId=invalid',
        'tables?limit=101',
        'rooms?page=0',
        'tables?customerId=foreign',
        'tables/invalid',
      ])
        await dining(suffix).expect(400);
      await get(
        '/branches/invalid/tables',
        staff.get(UserRole.GENERAL_MANAGER),
      ).expect(400);
      await get('/loyalty/redemptions/me?limit=101').expect(400);
      await get('/loyalty/redemptions/me?userId=other').expect(400);
      for (const extra of [
        { customerId: customers[1] },
        { pointsCost: 0 },
        { discountPercent: 100 },
      ]) {
        await request(app.getHttpServer())
          .post('/api/v1/loyalty/redemptions')
          .set('Authorization', `Bearer ${tokens[0]}`)
          .send({ ...input(), ...extra })
          .expect(400);
      }
      await redeem({ ...input(), orderId: 'invalid' }).expect(400);
      expect(await balance()).toBe(1000);
    });

    it('no filtra mesas o salones ajenos ni sucursales inactivas', async () => {
      await dining(`tables/${tables[3]}`).expect(404);
      await dining(`tables?roomId=${rooms[2]}`).expect(404);
      await dining(`tables/${randomUUID()}`).expect(404);
      await prisma.branch.update({
        where: { id: branches[0] },
        data: { isActive: false },
      });
      await dining('tables').expect(404);
    });

    it('impide asociar una mesa a un salón de otra sucursal en la base de datos', async () => {
      await expect(
        db.query('UPDATE tables SET room_id=$1 WHERE id=$2', [
          rooms[2],
          tables[0],
        ]),
      ).rejects.toMatchObject({
        code: '23503',
        constraint: 'tables_room_id_branch_id_fkey',
      });
      expect(
        (
          await prisma.diningTable.findUniqueOrThrow({
            where: { id: tables[0] },
          })
        ).roomId,
      ).toBe(rooms[0]);
    });

    it('ofrece las cuatro recompensas iniciales y un historial vacío comprensible', async () => {
      const response = await get('/loyalty/rewards').expect(200);
      expect(
        response.body
          .filter((reward: { id: string }) => rewardIds.includes(reward.id))
          .map((reward: { pointsCost: number }) => reward.pointsCost),
      ).toEqual([20, 60, 100, 150]);
      const discount = response.body.find(
        (reward: { id: string }) => reward.id === rewardIds[2],
      );
      expect(discount).toMatchObject({
        rewardType: 'PERCENT_DISCOUNT',
        discountPercent: 10,
        productName: null,
      });
      await get('/loyalty/redemptions/me').expect(200, {
        items: [],
        total: 0,
        page: 1,
        limit: 20,
      });
    });

    it('aplica el 10%, cobra el neto y acredita puntos sobre el importe pagado', async () => {
      const body = input(rewardIds[2]);
      const result = await redeem(body).expect(201);
      expect(result.body).toMatchObject({
        status: 'USED',
        pointsCost: 100,
        discountPercent: 10,
        order: { id: orders[0], total: '15.30', discount: '1.70' },
      });
      expect(await balance()).toBe(900);
      const payment = await request(app.getHttpServer())
        .post('/api/v1/payments/simulate')
        .set('Authorization', `Bearer ${tokens[0]}`)
        .send({ orderId: orders[0], cardToken: 'test_4242' })
        .expect(201);
      expect(payment.body).toMatchObject({
        status: 'APROBADO',
        amount: '15.30',
        receipt: { amount: '15.30' },
      });
      const persisted = await prisma.payment.findUniqueOrThrow({
        where: { id: payment.body.id },
      });
      expect(persisted.subtotal.toFixed(2)).toBe('17.00');
      expect(persisted.discount.toFixed(2)).toBe('1.70');
      expect(persisted.totalPaid.toFixed(2)).toBe('15.30');
      expect(await balance()).toBe(915);
      const replay = await redeem(body).expect(200);
      expect(replay.body.id).toBe(result.body.id);
      expect(await balance()).toBe(915);
      expect(
        (await get('/loyalty/redemptions/me').expect(200)).body.total,
      ).toBe(1);
      expect(
        (await get('/loyalty/redemptions/me', tokens[1]).expect(200)).body
          .total,
      ).toBe(0);
    }, 15000);

    it.each([
      [0, 'Salsa extra', 20],
      [1, 'Wantanes', 60],
      [3, 'Rollitos primavera', 150],
    ] as const)(
      'añade %s como unidad gratuita visible para cocina',
      async (index, name, cost) => {
        await redeem(input(rewardIds[index])).expect(201);
        const gift = await prisma.orderItem.findFirstOrThrow({
          where: { orderId: orders[0], dishName: name },
        });
        expect(gift.quantity).toBe(1);
        expect(gift.unitPrice.toFixed(2)).toBe('0.00');
        expect(await balance()).toBe(1000 - cost);
        expect(
          (
            await prisma.order.findUniqueOrThrow({ where: { id: orders[0] } })
          ).total?.toFixed(2),
        ).toBe('17.00');
        const queue = await get(
          '/kitchen/orders',
          staff.get(UserRole.COOK),
        ).expect(200);
        const row = queue.body.find(
          (order: { id: string }) => order.id === orders[0],
        );
        expect(row.items).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              name,
              quantity: 1,
              note: 'Canje de puntos',
            }),
          ]),
        );
      },
    );

    it('conserva los puntos si no hay cuenta o el saldo es insuficiente', async () => {
      await prisma.loyaltyAccount.delete({ where: { userId: customers[0] } });
      await redeem().expect(409);
      expect(
        await prisma.loyaltyAccount.findUnique({
          where: { userId: customers[0] },
        }),
      ).toBeNull();
      await prisma.loyaltyAccount.create({
        data: { userId: customers[0], points: 19 },
      });
      await redeem().expect(409);
      expect(await balance()).toBe(19);
      expect(
        await prisma.redemption.count({ where: { customerId: customers[0] } }),
      ).toBe(0);
    });

    it('rechaza producto agotado, sucursal cerrada y recompensa inactiva sin gastar puntos', async () => {
      await prisma.dish.update({
        where: { branchId_name: { branchId: branches[0], name: 'Wantanes' } },
        data: { isAvailable: false },
      });
      await redeem(input(rewardIds[1])).expect(409);
      await prisma.branchConfig.update({
        where: { branchId: branches[0] },
        data: { isOpen: false },
      });
      await redeem(input(rewardIds[2])).expect(409);
      await prisma.branchConfig.update({
        where: { branchId: branches[0] },
        data: { isOpen: true },
      });
      await prisma.benefit.update({
        where: { id: customBenefit },
        data: { isActive: false },
      });
      await redeem(input(customBenefit)).expect(404);
      expect(
        (await get('/loyalty/rewards').expect(200)).body.map(
          (reward: { id: string }) => reward.id,
        ),
      ).not.toContain(customBenefit);
      expect(await balance()).toBe(1000);
    });

    it('rechaza pedidos ajenos, inexistentes y ya pagados', async () => {
      await redeem(input(rewardIds[0], orders[2])).expect(404);
      await redeem(input(rewardIds[0], randomUUID())).expect(404);
      await redeem(input(randomUUID())).expect(404);
      await prisma.payment.create({
        data: {
          orderId: orders[0],
          branchId: branches[0],
          status: 'PAID',
          subtotal: '17.00',
          totalPaid: '17.00',
        },
      });
      await redeem().expect(409);
      expect(await balance()).toBe(1000);
    });

    it.each(['IN_PREPARATION', 'READY', 'CANCELED'] as const)(
      'rechaza el pedido en estado %s',
      async (status) => {
        await prisma.order.update({
          where: { id: orders[0] },
          data: { status },
        });
        await redeem().expect(409);
        expect(await balance()).toBe(1000);
      },
    );

    it('limita un canje por pedido y detecta claves reutilizadas con otro contenido', async () => {
      const body = input();
      await redeem(body).expect(201);
      await redeem(input(rewardIds[2])).expect(409);
      await redeem({ ...body, orderId: orders[1] }).expect(409);
      await redeem({ ...body, benefitId: rewardIds[1] }).expect(409);
      await redeem({ ...body, orderId: orders[2] }, tokens[1]).expect(409);
      expect(await balance()).toBe(980);
      expect(
        await prisma.orderItem.count({
          where: { orderId: orders[0], unitPrice: 0 },
        }),
      ).toBe(1);
    });

    async function slowRedemptions(action: () => Promise<void>) {
      await db.query(`CREATE FUNCTION hu03_slow_redemption() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(0.2); RETURN NEW; END $$;
      CREATE TRIGGER hu03_slow_redemption BEFORE INSERT ON redemptions FOR EACH ROW EXECUTE FUNCTION hu03_slow_redemption()`);
      try {
        await action();
      } finally {
        await db.query(
          'DROP TRIGGER hu03_slow_redemption ON redemptions; DROP FUNCTION hu03_slow_redemption()',
        );
      }
    }

    it('reintentos coincidentes generan un canje, un débito y una unidad gratuita', async () => {
      await slowRedemptions(async () => {
        const body = input();
        const results = await Promise.all([redeem(body), redeem(body)]);
        expect(
          results
            .map((result) => result.status)
            .sort((left, right) => left - right),
        ).toEqual([200, 201]);
        expect(results[0].body.id).toBe(results[1].body.id);
        expect(await balance()).toBe(980);
        expect(
          await prisma.pointsMovement.count({
            where: { customerId: customers[0], type: 'REDEEM' },
          }),
        ).toBe(1);
        expect(
          await prisma.orderItem.count({
            where: { orderId: orders[0], unitPrice: 0 },
          }),
        ).toBe(1);
      });
    });

    it('dos pedidos concurrentes no gastan el mismo saldo dos veces', async () => {
      await prisma.loyaltyAccount.update({
        where: { userId: customers[0] },
        data: { points: 60 },
      });
      await slowRedemptions(async () => {
        const results = await Promise.all([
          redeem(input(rewardIds[1], orders[0])),
          redeem(input(rewardIds[1], orders[1])),
        ]);
        expect(
          results
            .map((result) => result.status)
            .sort((left, right) => left - right),
        ).toEqual([201, 409]);
        expect(await balance()).toBe(0);
        expect(
          await prisma.redemption.count({
            where: { customerId: customers[0] },
          }),
        ).toBe(1);
        const movement = await prisma.pointsMovement.findFirstOrThrow({
          where: { customerId: customers[0], type: 'REDEEM' },
        });
        expect(movement.points).toBe(-60);
      });
    });

    it('revierte saldo, canje, producto y total si falla el movimiento al final', async () => {
      await db.query(`CREATE FUNCTION hu03_fail_movement() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'HU03 rollback test'; END $$;
      CREATE TRIGGER hu03_fail_movement BEFORE INSERT ON points_movements FOR EACH ROW WHEN (NEW.type='REDEEM') EXECUTE FUNCTION hu03_fail_movement()`);
      try {
        await redeem(input(rewardIds[1])).expect(500);
        expect(await balance()).toBe(1000);
        expect(
          await prisma.redemption.count({
            where: { customerId: customers[0] },
          }),
        ).toBe(0);
        expect(
          await prisma.orderItem.count({ where: { orderId: orders[0] } }),
        ).toBe(1);
        const order = await prisma.order.findUniqueOrThrow({
          where: { id: orders[0] },
        });
        expect(order.loyaltyRedemptionId).toBeNull();
        expect(order.total?.toFixed(2)).toBe('17.00');
      } finally {
        await db.query(
          'DROP TRIGGER hu03_fail_movement ON points_movements; DROP FUNCTION hu03_fail_movement()',
        );
      }
    });

    it('conserva el nombre y coste históricos del canje aunque cambie el beneficio', async () => {
      const result = await redeem(input(customBenefit)).expect(201);
      await prisma.benefit.update({
        where: { id: customBenefit },
        data: { name: 'Nuevo nombre', pointsCost: 125 },
      });
      const history = await get('/loyalty/redemptions/me?limit=1').expect(200);
      expect(history.body.items[0]).toMatchObject({
        id: result.body.id,
        pointsCost: 25,
        rewardName: 'Wantanes personalizados',
      });
      expect(await balance()).toBe(975);
      await expect(
        db.query('UPDATE benefits SET points_cost=0 WHERE id=$1', [
          customBenefit,
        ]),
      ).rejects.toMatchObject({ code: '23514' });
    });
  },
);
