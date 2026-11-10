import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Client } from 'pg';
import request from 'supertest';
import { LoyaltyRepository } from '../src/customer-features/repositories/loyalty.repository.js';
import { PointsMovementRepository } from '../src/customer-features/repositories/points-movement.repository.js';
import { LoyaltyAccrualError } from '../src/customer-features/errors/loyalty-accrual.error.js';
import { SimulatedPaymentsRepository } from '../src/payments/simulation/repositories/simulated-payments.repository.js';

const branchId = randomUUID();
const otherBranchId = randomUUID();
const categoryId = randomUUID();
const dishId = randomUUID();
const userIds: string[] = [];

describe.sequential(
  'BE-07: puntos, autorización e idempotencia en PostgreSQL',
  () => {
    let app: INestApplication;
    let module: TestingModule;
    let client: Client;
    let loyalty: LoyaltyRepository;
    let customerId: string;
    let otherCustomerId: string;
    let token: string;
    let otherToken: string;

    beforeAll(async () => {
      if (!process.env.DATABASE_URL)
        throw new Error('Configurar DATABASE_URL para PostgreSQL de Docker.');
      const { AppModule } = await import('../src/app.module.js');
      module = await Test.createTestingModule({
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
      loyalty = module.get(LoyaltyRepository);
      client = new Client({ connectionString: process.env.DATABASE_URL });
      await client.connect();
      for (const id of [branchId, otherBranchId]) {
        await client.query(
          'INSERT INTO branches (id,name,address) VALUES ($1,$2,$3)',
          [id, id, 'BE-07'],
        );
      }
      await client.query(
        'INSERT INTO categories (id,branch_id,name) VALUES ($1,$2,$3)',
        [categoryId, branchId, 'BE-07'],
      );
      await client.query(
        'INSERT INTO dishes (id,branch_id,category_id,name,price) VALUES ($1,$2,$3,$4,12.75)',
        [dishId, branchId, categoryId, 'BE-07'],
      );
    });
    beforeEach(async () => {
      customerId = await createUser();
      otherCustomerId = await createUser();
      token = await module.get(JwtService).signAsync({ sub: customerId });
      otherToken = await module
        .get(JwtService)
        .signAsync({ sub: otherCustomerId });
    });
    afterAll(async () => {
      if (app) await app.close();
      if (!client) return;
      try {
        await client.query(
          'DELETE FROM points_movements WHERE customer_id=ANY($1::uuid[])',
          [userIds],
        );
        await client.query(
          'DELETE FROM loyalty_accounts WHERE user_id=ANY($1::uuid[])',
          [userIds],
        );
        await client.query(
          'DELETE FROM simple_receipts WHERE payment_id IN (SELECT id FROM payments WHERE branch_id=ANY($1::uuid[]))',
          [[branchId, otherBranchId]],
        );
        await client.query(
          'DELETE FROM payments WHERE branch_id=ANY($1::uuid[])',
          [[branchId, otherBranchId]],
        );
        await client.query('DELETE FROM orders WHERE branch_id=$1', [branchId]);
        await client.query('DELETE FROM dishes WHERE id=$1', [dishId]);
        await client.query('DELETE FROM categories WHERE id=$1', [categoryId]);
        await client.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [
          userIds,
        ]);
        await client.query('DELETE FROM branches WHERE id=ANY($1::uuid[])', [
          [branchId, otherBranchId],
        ]);
      } finally {
        await client.end();
      }
    });

    async function createUser(role = 'CLIENT') {
      const id = randomUUID();
      userIds.push(id);
      await client.query(
        'INSERT INTO users (id,name,email,password_hash,role,branch_id,updated_at) VALUES ($1,$2,$3,$4,$5,$6,now())',
        [
          id,
          'BE-07',
          `${id}@example.com`,
          'not-used',
          role,
          role === 'CLIENT' || role === 'GENERAL_MANAGER' ? null : branchId,
        ],
      );
      return id;
    }
    async function createOrder(
      total = '12.75',
      owner: string | null = customerId,
    ) {
      const id = randomUUID();
      await client.query(
        "INSERT INTO orders (id,branch_id,customer_id,type,payment_mode,operation_id,updated_at) VALUES ($1,$2,$3,'TAKEOUT','ONLINE',gen_random_uuid(),now())",
        [id, branchId, owner],
      );
      await client.query(
        'INSERT INTO order_items (id,order_id,dish_id,dish_name,quantity,unit_price) VALUES ($1,$2,$3,$4,1,$5)',
        [randomUUID(), id, dishId, 'BE-07', total],
      );
      return id;
    }
    async function createEvent(
      total = '12.75',
      owner: string | null = customerId,
      paymentBranch = branchId,
    ) {
      const orderId = await createOrder(total, owner);
      const id = randomUUID();
      await client.query(
        "INSERT INTO payments (id,branch_id,order_id,subtotal,total_paid,status) VALUES ($1,$2,$3,$4,$4,'PAID')",
        [id, paymentBranch, orderId, total],
      );
      return { id, orderId };
    }
    function pay(orderId: string, cardToken = 'test_4242', auth = token) {
      return request(app.getHttpServer())
        .post('/api/v1/payments/simulate')
        .auth(auth, { type: 'bearer' })
        .send({ orderId, cardToken });
    }
    function balance(auth = token) {
      return request(app.getHttpServer())
        .get('/api/v1/loyalty/me')
        .auth(auth, { type: 'bearer' });
    }
    async function state(paymentId: string) {
      const result = await client.query<{ count: number; points: number }>(
        "SELECT count(*)::int AS count, COALESCE(sum(points),0)::int AS points FROM points_movements WHERE payment_id=$1 AND type='EARN'",
        [paymentId],
      );
      return {
        ...result.rows[0],
        balance: await loyalty.getBalance(customerId),
      };
    }

    it.each([
      ['0.99', 0],
      ['1.00', 1],
      ['12.75', 12],
    ])('acredita floor(%s) al confirmar el pago', async (total, points) => {
      const result = await pay(await createOrder(total)).expect(201);
      expect(result.body.status).toBe('APROBADO');
      expect(await state(result.body.id as string)).toEqual({
        count: points ? 1 : 0,
        points,
        balance: points,
      });
      await balance().expect(200, { points });
      if (!points) {
        const accounts = await client.query<{ count: number }>(
          'SELECT count(*)::int AS count FROM loyalty_accounts WHERE user_id=$1',
          [customerId],
        );
        expect(accounts.rows[0].count).toBe(0);
      }
    });
    it('no acredita el rechazo ni sus eventos repetidos', async () => {
      const result = await pay(await createOrder(), 'test_0002').expect(201);
      expect(result.body.status).toBe('RECHAZADO');
      await loyalty.accruePayment(result.body.id as string);
      await loyalty.accruePayment(result.body.id as string);
      expect(await state(result.body.id as string)).toEqual({
        count: 0,
        points: 0,
        balance: 0,
      });
      await balance().expect(200, { points: 0 });
    });
    it('reprocesa el mismo paymentId sin duplicar movimiento ni saldo', async () => {
      const result = await pay(await createOrder()).expect(201);
      await loyalty.accruePayment(result.body.id as string);
      await loyalty.accruePayment(result.body.id as string);
      expect(await state(result.body.id as string)).toEqual({
        count: 1,
        points: 12,
        balance: 12,
      });
    });
    it('dos primeros procesamientos simultáneos del mismo paymentId dejan un solo EARN', async () => {
      const event = await createEvent();
      await Promise.all([
        loyalty.accruePayment(event.id),
        loyalty.accruePayment(event.id),
      ]);
      expect(await state(event.id)).toEqual({
        count: 1,
        points: 12,
        balance: 12,
      });
      await balance().expect(200, { points: 12 });
    });
    it('dos confirmaciones HTTP simultáneas crean un pago, un comprobante y un EARN', async () => {
      const orderId = await createOrder();
      const responses = await Promise.all([pay(orderId), pay(orderId)]);
      expect(
        responses.map((response) => response.status).sort((a, b) => a - b),
      ).toEqual([201, 409]);
      const approved = responses.find((response) => response.status === 201)!;
      expect(await state(approved.body.id as string)).toEqual({
        count: 1,
        points: 12,
        balance: 12,
      });
      const counts = await client.query<{ payments: number; receipts: number }>(
        'SELECT count(*)::int AS payments, count(r.id)::int AS receipts FROM payments p LEFT JOIN simple_receipts r ON r.payment_id=p.id WHERE p.order_id=$1',
        [orderId],
      );
      expect(counts.rows[0]).toEqual({ payments: 1, receipts: 1 });
      await pay(orderId).expect(409);
      expect(await state(approved.body.id as string)).toEqual({
        count: 1,
        points: 12,
        balance: 12,
      });
    });
    it('pagos distintos del mismo cliente incrementan sin perder saldo bajo concurrencia', async () => {
      const first = await createEvent('12.75');
      const second = await createEvent('1.00');
      await Promise.all([
        loyalty.accruePayment(first.id),
        loyalty.accruePayment(second.id),
      ]);
      await balance().expect(200, { points: 13 });
      expect((await state(first.id)).count).toBe(1);
      expect((await state(second.id)).count).toBe(1);
    });
    it('aísla los saldos y rechaza rutas para cuentas ajenas', async () => {
      const first = await createEvent('12.75');
      const second = await createEvent('1.00', otherCustomerId);
      await Promise.all([
        loyalty.accruePayment(first.id),
        loyalty.accruePayment(second.id),
      ]);
      await balance().expect(200, { points: 12 });
      await balance(otherToken).expect(200, { points: 1 });
      await request(app.getHttpServer())
        .get(`/api/v1/loyalty/${otherCustomerId}`)
        .auth(token, { type: 'bearer' })
        .expect(404);
      await request(app.getHttpServer())
        .get(`/api/v1/loyalty/me?userId=${otherCustomerId}`)
        .auth(token, { type: 'bearer' })
        .expect(200, { points: 12 });
      await pay(await createOrder('1.00', otherCustomerId)).expect(403);
    });
    it('devuelve cero sin crear una cuenta al consultar', async () => {
      await balance().expect(200, { points: 0 });
      const result = await client.query<{ count: number }>(
        'SELECT count(*)::int AS count FROM loyalty_accounts WHERE user_id=$1',
        [customerId],
      );
      expect(result.rows[0].count).toBe(0);
    });
    it('requiere sesión válida', async () => {
      await request(app.getHttpServer()).get('/api/v1/loyalty/me').expect(401);
      await balance('invalid').expect(401);
    });
    it.each([
      'WAITER',
      'COOK',
      'CASHIER',
      'INVENTORY_MANAGER',
      'BRANCH_ADMIN',
      'GENERAL_MANAGER',
    ])('rechaza el rol %s', async (role) => {
      const staffToken = await module
        .get(JwtService)
        .signAsync({ sub: await createUser(role) });
      await balance(staffToken).expect(403);
    });
    it.each(['sin cliente', 'cancelado', 'otra sucursal', 'pendiente'])(
      'no acredita un evento %s',
      async (scenario) => {
        const event = await createEvent(
          '12.75',
          scenario === 'sin cliente' ? null : customerId,
          scenario === 'otra sucursal' ? otherBranchId : branchId,
        );
        if (scenario === 'cancelado')
          await client.query(
            "UPDATE orders SET status='CANCELED' WHERE id=$1",
            [event.orderId],
          );
        if (scenario === 'pendiente')
          await client.query(
            "UPDATE payments SET status='PENDING' WHERE id=$1",
            [event.id],
          );
        await loyalty.accruePayment(event.id);
        expect(await state(event.id)).toEqual({
          count: 0,
          points: 0,
          balance: 0,
        });
      },
    );
    it('findByPayment busca EARN aunque un ajuste ya referencie el pago', async () => {
      const event = await createEvent();
      await client.query(
        "INSERT INTO points_movements (id,customer_id,type,points,payment_id) VALUES ($1,$2,'ADJUSTMENT',0,$3)",
        [randomUUID(), customerId, event.id],
      );
      const movements = module.get(PointsMovementRepository);
      expect(await movements.findByPayment(event.id)).toBeNull();
      await loyalty.accruePayment(event.id);
      expect(await movements.findByPayment(event.id)).toMatchObject({
        type: 'EARN',
        points: 12,
        customerId,
      });
      expect(await state(event.id)).toEqual({
        count: 1,
        points: 12,
        balance: 12,
      });
    });
    it('revierte pago, comprobante y EARN si falla el incremento del saldo', async () => {
      await client.query(
        'INSERT INTO loyalty_accounts (user_id,points) VALUES ($1,2147483647)',
        [customerId],
      );
      await client.query(
        "INSERT INTO points_movements (id,customer_id,type,points) VALUES ($1,$2,'ADJUSTMENT',2147483647)",
        [randomUUID(), customerId],
      );
      const orderId = await createOrder('1.00');
      await expect(
        module.get(SimulatedPaymentsRepository).record(orderId, customerId, {
          approved: true,
          last4: '4242',
          reason: null,
        }),
      ).rejects.toBeInstanceOf(LoyaltyAccrualError);
      const result = await client.query<{ count: number }>(
        'SELECT count(*)::int AS count FROM payments WHERE order_id=$1',
        [orderId],
      );
      expect(result.rows[0].count).toBe(0);
      const movements = await client.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM points_movements WHERE customer_id=$1 AND type='EARN'",
        [customerId],
      );
      expect(movements.rows[0].count).toBe(0);
      await balance().expect(200, { points: 2147483647 });
    });
    it('documenta la respuesta y los errores de autorización en Swagger', () => {
      const doc = SwaggerModule.createDocument(
        app,
        new DocumentBuilder().addBearerAuth().build(),
      );
      const operation = doc.paths['/api/v1/loyalty/me'].get!;
      expect(operation.responses).toHaveProperty('200');
      expect(operation.responses).toHaveProperty('401');
      expect(operation.responses).toHaveProperty('403');
      expect(operation.security).toEqual([{ bearer: [] }]);
      expect(doc.components?.schemas?.LoyaltyBalanceDto).toMatchObject({
        required: ['points'],
        properties: { points: { type: 'integer', minimum: 0 } },
      });
    });
  },
);
