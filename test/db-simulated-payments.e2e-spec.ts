import 'dotenv/config';
import { randomBytes, randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Client } from 'pg';
import request from 'supertest';

const branchId = randomUUID();
const customerId = randomUUID();
const dishId = randomUUID();
const categoryId = randomUUID();

describe.sequential('BE-06: endpoint y persistencia Prisma reales', () => {
  let app: INestApplication | undefined;
  let client: Client | undefined;
  let token: string;
  let orderId: string;
  let fixtures = false;

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
    client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    await client.query('BEGIN');
    try {
      await client.query(
        'INSERT INTO branches (id,name,address) VALUES ($1,$2,$3)',
        [branchId, branchId, 'BE-06'],
      );
      await client.query(
        'INSERT INTO users (id,name,email,password_hash,role,updated_at) VALUES ($1,$2,$3,$4,$5,CURRENT_TIMESTAMP)',
        [
          customerId,
          'Test',
          `${customerId}@example.com`,
          'not-used-for-login',
          'CLIENT',
        ],
      );
      await client.query(
        'INSERT INTO categories (id,branch_id,name) VALUES ($1,$2,$3)',
        [categoryId, branchId, 'Platos'],
      );
      await client.query(
        'INSERT INTO dishes (id,branch_id,category_id,name,price) VALUES ($1,$2,$3,$4,$5)',
        [dishId, branchId, categoryId, 'Ramen', '8.50'],
      );
      await client.query('COMMIT');
      fixtures = true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
    token = await module.get(JwtService).signAsync({ sub: customerId });
  });
  beforeEach(async () => {
    orderId = randomUUID();
    await client!.query(
      "INSERT INTO orders (id,branch_id,customer_id,type,payment_mode,operation_id,updated_at) VALUES ($1,$2,$3,'TAKEOUT','ONLINE',gen_random_uuid(),CURRENT_TIMESTAMP)",
      [orderId, branchId, customerId],
    );
    await client!.query(
      'INSERT INTO order_items (id,order_id,dish_id,dish_name,quantity,unit_price) VALUES ($1,$2,$3,$4,$5,$6)',
      [randomUUID(), orderId, dishId, 'Ramen', 2, '8.50'],
    );
  });
  afterAll(async () => {
    if (app) await app.close();
    if (client) {
      try {
        if (fixtures) {
          await client.query(
            'DELETE FROM points_movements WHERE customer_id=$1',
            [customerId],
          );
          await client.query('DELETE FROM loyalty_accounts WHERE user_id=$1', [
            customerId,
          ]);
          await client.query(
            'DELETE FROM simple_receipts WHERE payment_id IN (SELECT id FROM payments WHERE branch_id=$1)',
            [branchId],
          );
          await client.query('DELETE FROM payments WHERE branch_id=$1', [
            branchId,
          ]);
          await client.query('DELETE FROM orders WHERE branch_id=$1', [
            branchId,
          ]);
          await client.query('DELETE FROM dishes WHERE branch_id=$1', [
            branchId,
          ]);
          await client.query('DELETE FROM categories WHERE branch_id=$1', [
            branchId,
          ]);
          await client.query('DELETE FROM branches WHERE id=$1', [branchId]);
          await client.query('DELETE FROM users WHERE id=$1', [customerId]);
        }
      } finally {
        await client.end();
      }
    }
  });
  function post(cardToken = 'test_4242') {
    return request(app!.getHttpServer())
      .post('/api/v1/payments/simulate')
      .set('Authorization', `Bearer ${token}`)
      .send({ orderId, cardToken });
  }

  it.each(['DINE_IN', 'DELIVERY'])(
    'rechaza pedido propio %s sin registrar pagos ni comprobantes',
    async (type) => {
      await client!.query(
        'UPDATE orders SET type=$1, payment_mode=NULL WHERE id=$2',
        [type, orderId],
      );
      await post().expect(409);
      const payments = await client!.query(
        'SELECT count(*)::int AS count FROM payments WHERE order_id=$1',
        [orderId],
      );
      expect(payments.rows[0].count).toBe(0);
    },
  );
  it('rechaza pedido cancelado sin registrar intentos', async () => {
    await client!.query("UPDATE orders SET status='CANCELED' WHERE id=$1", [
      orderId,
    ]);
    await post().expect(409);
    const payments = await client!.query(
      'SELECT count(*)::int AS count FROM payments WHERE order_id=$1',
      [orderId],
    );
    expect(payments.rows[0].count).toBe(0);
  });

  it('conserva rechazo y permite aprobar con un único comprobante no fiscal', async () => {
    const rejected = await post('test_0002').expect(201);
    expect(rejected.body).toMatchObject({
      status: 'RECHAZADO',
      receipt: null,
      last4: '0002',
    });
    const unpaid = await client!.query(
      'SELECT status FROM orders WHERE id=$1',
      [orderId],
    );
    expect(unpaid.rows[0].status).toBe('PENDING');
    const receipts = await client!.query(
      'SELECT count(*)::int AS count FROM simple_receipts r JOIN payments p ON p.id=r.payment_id WHERE p.order_id=$1',
      [orderId],
    );
    expect(receipts.rows[0].count).toBe(0);
    const approved = await post().expect(201);
    expect(approved.body).toMatchObject({
      status: 'APROBADO',
      amount: '17.00',
      receipt: { amount: '17.00' },
    });
    const rows = await client!.query(
      'SELECT status,last4,total_paid::text FROM payments WHERE order_id=$1 ORDER BY total_paid',
      [orderId],
    );
    expect(rows.rows).toEqual([
      { status: 'REJECTED', last4: '0002', total_paid: '0.00' },
      { status: 'PAID', last4: '4242', total_paid: '17.00' },
    ]);
  }, 10000);
  it('rechaza segundo cobro después de aprobar y no duplica comprobantes', async () => {
    await post().expect(201);
    await post().expect(409);
    const count = await client!.query(
      'SELECT count(*)::int AS count FROM simple_receipts r JOIN payments p ON p.id=r.payment_id WHERE p.order_id=$1',
      [orderId],
    );
    expect(count.rows[0].count).toBe(1);
    const payments = await client!.query(
      'SELECT count(*)::int AS count FROM payments WHERE order_id=$1',
      [orderId],
    );
    expect(payments.rows[0].count).toBe(1);
  });
  it('dos pagos concurrentes producen solo un aprobado', async () => {
    const results = await Promise.all([post(), post()]);
    expect(
      results
        .map((result) => result.status)
        .sort((left, right) => left - right),
    ).toEqual([201, 409]);
    const count = await client!.query(
      "SELECT count(*)::int AS count FROM payments WHERE order_id=$1 AND status='PAID'",
      [orderId],
    );
    expect(count.rows[0].count).toBe(1);
  });
  it('cobra el precio histórico aunque cambie el menú', async () => {
    await client!.query('UPDATE dishes SET price=10.00 WHERE id=$1', [dishId]);
    const response = await post().expect(201);
    expect(response.body.amount).toBe('17.00');
  });
  it('rechaza pedidos ajenos sin registrar intento', async () => {
    await client!.query('UPDATE orders SET customer_id=NULL WHERE id=$1', [
      orderId,
    ]);
    await post().expect(403);
    const count = await client!.query(
      'SELECT count(*)::int AS count FROM payments WHERE order_id=$1',
      [orderId],
    );
    expect(count.rows[0].count).toBe(0);
  });
});
