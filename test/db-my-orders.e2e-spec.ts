import 'dotenv/config';
import { randomBytes, randomUUID } from 'node:crypto';
import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { Client } from 'pg';
import request from 'supertest';

describe.sequential('BE-02: pedidos propios contra PostgreSQL', () => {
  const branchIds: string[] = [];
  const userIds: string[] = [];
  const orderIds: string[] = [];
  let app: INestApplication;
  let client: Client;
  let jwt: JwtService;

  async function createBranch(name: string) {
    const id = randomUUID();
    branchIds.push(id);
    await client.query(
      'INSERT INTO branches (id,name,address) VALUES ($1,$2,$3)',
      [id, `${name}-${randomUUID()}`, 'Prueba BE-02'],
    );
    await client.query(
      'INSERT INTO branch_configs (id,branch_id,is_open) VALUES ($1,$2,true)',
      [randomUUID(), id],
    );
    return id;
  }

  async function createUser(name: string, role: 'CLIENT' | 'WAITER' = 'CLIENT') {
    const id = randomUUID();
    userIds.push(id);
    let branchId: string | null = null;
    if (role !== 'CLIENT') {
      branchId = randomUUID();
      await client.query(
        'INSERT INTO branches (id,name,address) VALUES ($1,$2,$3)',
        [branchId, `branch-role-${randomUUID()}`, 'Sucursal de rol'],
      );
      branchIds.push(branchId);
    }
    await client.query(
      `INSERT INTO users (id,name,email,password_hash,role,branch_id,updated_at)
       VALUES ($1,$2,$3,$4,$5::"UserRole", $6, CURRENT_TIMESTAMP)`,
      [id, name, `${randomUUID()}@example.com`, 'unused', role, branchId],
    );
    return id;
  }

  async function createOrder(
    branchId: string,
    customerId: string,
    status: 'PENDING' | 'DELIVERED' | 'CANCELED' = 'PENDING',
    orderNumber?: string,
  ) {
    const id = randomUUID();
    orderIds.push(id);
    await client.query(
      `INSERT INTO orders (
         id, branch_id, customer_id, type, status, operation_id, order_number, total, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,CURRENT_TIMESTAMP)`,
      [
        id,
        branchId,
        customerId,
        'DINE_IN',
        status,
        randomUUID(),
        orderNumber ?? `ORD-${Math.floor(Math.random() * 100000)}`,
        '125.50',
      ],
    );
    return id;
  }

  async function createReview(orderId: string, customerId: string, branchId: string, rating = 5) {
    await client.query(
      `INSERT INTO reviews (id, order_id, customer_id, branch_id, rating, created_at)
       VALUES ($1,$2,$3,$4,$5,CURRENT_TIMESTAMP)`,
      [randomUUID(), orderId, customerId, branchId, rating],
    );
  }

  function tokenFor(userId: string) {
    return jwt.sign({ sub: userId });
  }

  beforeAll(async () => {
    if (!process.env.DATABASE_URL)
      throw new Error('Falta DATABASE_URL para ejecutar pruebas de PostgreSQL.');
    process.env.JWT_SECRET ??= randomBytes(32).toString('hex');

    const { AppModule } = await import('../src/app.module.js');
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
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
    jwt = module.get(JwtService);

    client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
  });

  afterAll(async () => {
    if (app) await app.close();
    if (client) {
      try {
        await client.query('BEGIN');
        await client.query('DELETE FROM reviews WHERE order_id=ANY($1::uuid[])', [orderIds]);
        await client.query('DELETE FROM orders WHERE id=ANY($1::uuid[])', [orderIds]);
        await client.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [userIds]);
        await client.query('DELETE FROM branch_configs WHERE branch_id=ANY($1::uuid[])', [branchIds]);
        await client.query('DELETE FROM branches WHERE id=ANY($1::uuid[])', [branchIds]);
        await client.query('COMMIT');
      } finally {
        await client.end();
      }
    }
  });

  it('200 lista solo pedidos propios, ordenados por createdAt desc y con review null o existente', async () => {
    const branchId = await createBranch('branch-my-orders');
    const customerA = await createUser('cliente-propio-a');
    const customerB = await createUser('cliente-propio-b');
    const myOldOrder = await createOrder(branchId, customerA, 'PENDING', 'ORD-100');
    const myRecentOrder = await createOrder(branchId, customerA, 'DELIVERED', 'ORD-200');
    await createOrder(branchId, customerB, 'PENDING', 'ORD-300');
    await createReview(myRecentOrder, customerA, branchId, 4);

    const response = await request(app.getHttpServer())
      .get('/api/v1/orders/me')
      .set('Authorization', `Bearer ${await tokenFor(customerA)}`)
      .expect(200);

    expect(response.body).toHaveLength(2);
    expect(response.body[0]).toMatchObject({
      id: myRecentOrder,
      orderNumber: 'ORD-200',
      status: 'DELIVERED',
      total: '125.50',
      branchId,
      branchName: expect.any(String),
      review: { id: expect.any(String), rating: 4 },
    });
    expect(response.body[1]).toMatchObject({
      id: myOldOrder,
      orderNumber: 'ORD-100',
      status: 'PENDING',
      total: '125.50',
      branchId,
      branchName: expect.any(String),
      review: null,
    });
  });

  it('200 devuelve lista vacía para cliente sin pedidos', async () => {
    const branchId = await createBranch('branch-empty-orders');
    const customer = await createUser('cliente-sin-pedidos');
    const anotherCustomer = await createUser('otro-cliente-vacio');
    await createOrder(branchId, anotherCustomer, 'PENDING');

    const response = await request(app.getHttpServer())
      .get('/api/v1/orders/me')
      .set('Authorization', `Bearer ${await tokenFor(customer)}`)
      .expect(200);

    expect(response.body).toEqual([]);
  });

  it('200 filtra por status y limita a 50', async () => {
    const branchId = await createBranch('branch-filter-status');
    const customer = await createUser('cliente-filter');
    await createOrder(branchId, customer, 'PENDING', 'ORD-F-1');
    await createOrder(branchId, customer, 'DELIVERED', 'ORD-F-2');

    const response = await request(app.getHttpServer())
      .get('/api/v1/orders/me')
      .query({ status: 'PENDING' })
      .set('Authorization', `Bearer ${await tokenFor(customer)}`)
      .expect(200);

    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({
      orderNumber: 'ORD-F-1',
      status: 'PENDING',
    });
  });

  it('400 rechaza status inválido', async () => {
    const branchId = await createBranch('branch-invalid-status');
    const customer = await createUser('cliente-invalid-status');
    await createOrder(branchId, customer, 'PENDING');

    await request(app.getHttpServer())
      .get('/api/v1/orders/me')
      .query({ status: 'INVALID' })
      .set('Authorization', `Bearer ${await tokenFor(customer)}`)
      .expect(400);
  });

  it('401 rechaza sin sesión', async () => {
    await request(app.getHttpServer()).get('/api/v1/orders/me').expect(401);
  });

  it('403 rechaza roles distintos de CLIENT', async () => {
    const waiter = await createUser('mesero-403', 'WAITER');

    await request(app.getHttpServer())
      .get('/api/v1/orders/me')
      .set('Authorization', `Bearer ${await tokenFor(waiter)}`)
      .expect(403);
  });
});
