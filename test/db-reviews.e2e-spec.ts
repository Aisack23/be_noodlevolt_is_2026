import 'dotenv/config';
import { randomBytes, randomUUID } from 'node:crypto';
import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { hash } from 'bcrypt';
import { Client } from 'pg';
import request from 'supertest';

describe.sequential('BE-11: reseñas contra PostgreSQL', () => {
  const password = 'Prueba1234!';
  const userIds: string[] = [];
  const branchIds: string[] = [];
  const orderIds: string[] = [];
  let app: INestApplication;
  let module: TestingModule;
  let client: Client;

  async function createBranch(name: string) {
    const id = randomUUID();
    branchIds.push(id);
    await client.query(
      'INSERT INTO branches (id,name,address) VALUES ($1,$2,$3)',
      [id, `${name}-${randomUUID()}`, 'Prueba'],
    );
    return id;
  }

  async function createUser(name: string, role: 'CLIENT' | 'WAITER' = 'CLIENT') {
    const id = randomUUID();
    userIds.push(id);
    const email = `${randomUUID()}@example.com`;
    const passwordHash = await hash(password, 4);
    await client.query(
      `INSERT INTO users (id,name,email,password_hash,role,updated_at)
       VALUES ($1,$2,$3,$4,$5::"UserRole", now())`,
      [id, name, email, passwordHash, role],
    );
    return { id, email };
  }

  async function createOrder(
    branchId: string,
    customerId: string,
    status: 'PENDING' | 'DELIVERED' = 'DELIVERED',
  ) {
    const id = randomUUID();
    orderIds.push(id);
    await client.query(
      `INSERT INTO orders (
        id, branch_id, customer_id, type, status, operation_id, total, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7, now())`,
      [id, branchId, customerId, 'DINE_IN', status, randomUUID(), '100.00'],
    );
    return id;
  }

  async function login(email: string) {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password });
    expect(response.status).toBe(200);
    return response.body.accessToken as string;
  }

  function reviewRequest(token: string | null, payload: Record<string, unknown>) {
    const requestCall = request(app.getHttpServer()).post('/api/v1/reviews');
    const call = token ? requestCall.auth(token, { type: 'bearer' }) : requestCall;
    return call.send(payload);
  }

  beforeAll(async () => {
    if (!process.env.DATABASE_URL)
      throw new Error(
        'Configurar DATABASE_URL y aplicar las migraciones en PostgreSQL de Docker.',
      );
    process.env.JWT_SECRET ??= randomBytes(32).toString('hex');
    const { AppModule } = await import('../src/app.module.js');
    module = await Test.createTestingModule({ imports: [AppModule] }).compile();
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
  });

  afterAll(async () => {
    if (app) await app.close();
    else if (module) await module.close();
    if (client) {
      try {
        await client.query('BEGIN');
        await client.query('DELETE FROM reviews WHERE branch_id=ANY($1::uuid[])', [
          branchIds,
        ]);
        await client.query('DELETE FROM orders WHERE id=ANY($1::uuid[])', [
          orderIds,
        ]);
        await client.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [userIds]);
        await client.query('DELETE FROM branches WHERE id=ANY($1::uuid[])', [
          branchIds,
        ]);
        await client.query('COMMIT');
      } finally {
        await client.end();
      }
    }
  });

  it('201 crea una reseña válida', async () => {
    const branchId = await createBranch('branch-review-ok');
    const customer = await createUser('cliente-review-ok');
    const orderId = await createOrder(branchId, customer.id, 'DELIVERED');
    const token = await login(customer.email);

    const response = await reviewRequest(token, {
      orderId,
      rating: 5,
      comment: 'Excelente servicio',
    }).expect(201);

    expect(response.body.review).toMatchObject({
      orderId,
      customerId: customer.id,
      branchId,
      rating: 5,
      comment: 'Excelente servicio',
    });
    expect(response.body.branchRating).toEqual({ average: 5, count: 1 });
  });

  it.each([
    { label: 'rating 0', payload: { orderId: randomUUID(), rating: 0 } },
    { label: 'rating 6', payload: { orderId: randomUUID(), rating: 6 } },
    { label: 'rating abc', payload: { orderId: randomUUID(), rating: 'abc' } },
  ])('400 rechaza $label', async ({ payload }) => {
    const branchId = await createBranch(`branch-invalid-${randomUUID()}`);
    const customer = await createUser('cliente-invalid');
    const orderId = await createOrder(branchId, customer.id, 'DELIVERED');
    const token = await login(customer.email);

    await reviewRequest(token, { ...payload, orderId }).expect(400);
  });

  it('401 rechaza sin sesión', async () => {
    const branchId = await createBranch('branch-review-unauth');
    const customer = await createUser('cliente-review-unauth');
    const orderId = await createOrder(branchId, customer.id, 'DELIVERED');

    await reviewRequest(null, {
      orderId,
      rating: 5,
    }).expect(401);
  });

  it('403 rechaza pedido ajeno', async () => {
    const branchId = await createBranch('branch-review-other');
    const owner = await createUser('cliente-propio');
    const other = await createUser('cliente-otro');
    const orderId = await createOrder(branchId, owner.id, 'DELIVERED');
    const token = await login(other.email);

    await reviewRequest(token, {
      orderId,
      rating: 5,
    }).expect(403);
  });

  it('404 rechaza pedido inexistente', async () => {
    const customer = await createUser('cliente-no-order');
    const token = await login(customer.email);

    await reviewRequest(token, {
      orderId: randomUUID(),
      rating: 5,
    }).expect(404);
  });

  it('409 rechaza pedido PENDING', async () => {
    const branchId = await createBranch('branch-review-pending');
    const customer = await createUser('cliente-pending');
    const orderId = await createOrder(branchId, customer.id, 'PENDING');
    const token = await login(customer.email);

    await reviewRequest(token, {
      orderId,
      rating: 5,
    }).expect(409);
  });

  it('409 rechaza reseña duplicada', async () => {
    const branchId = await createBranch('branch-review-duplicate');
    const customer = await createUser('cliente-duplicate');
    const orderId = await createOrder(branchId, customer.id, 'DELIVERED');
    const token = await login(customer.email);

    await reviewRequest(token, {
      orderId,
      rating: 5,
    }).expect(201);
    await reviewRequest(token, {
      orderId,
      rating: 4,
    }).expect(409);
  });

  it('solo crea una reseña cuando dos POST concurrentes llegan al mismo pedido', async () => {
    const branchId = await createBranch('branch-review-race');
    const customer = await createUser('cliente-race');
    const orderId = await createOrder(branchId, customer.id, 'DELIVERED');
    const token = await login(customer.email);

    const results = await Promise.allSettled([
      reviewRequest(token, { orderId, rating: 5 }),
      reviewRequest(token, { orderId, rating: 4 }),
    ]);

    const statuses = results.map((result) =>
      result.status === 'fulfilled' ? result.value.status : result.reason.status,
    );
    expect(statuses.filter((status) => status === 201)).toHaveLength(1);
    expect(statuses.filter((status) => status === 409)).toHaveLength(1);

    const { rows } = await client.query(
      'SELECT COUNT(*)::int AS count FROM reviews WHERE order_id=$1',
      [orderId],
    );
    expect(rows[0].count).toBe(1);
  });

  it('devuelve promedio correcto de reseñas por sucursal', async () => {
    const branchId = await createBranch('branch-review-average');
    const customerA = await createUser('cliente-average-a');
    const customerB = await createUser('cliente-average-b');
    const customerC = await createUser('cliente-average-c');

    const orderA = await createOrder(branchId, customerA.id, 'DELIVERED');
    const orderB = await createOrder(branchId, customerB.id, 'DELIVERED');
    const orderC = await createOrder(branchId, customerC.id, 'DELIVERED');

    await reviewRequest(await login(customerA.email), { orderId: orderA, rating: 3 }).expect(201);
    await reviewRequest(await login(customerB.email), { orderId: orderB, rating: 5 }).expect(201);
    await reviewRequest(await login(customerC.email), { orderId: orderC, rating: 4 }).expect(201);

    const response = await request(app.getHttpServer())
      .get(`/api/v1/branches/${branchId}/rating`)
      .expect(200);

    expect(response.body).toEqual({ average: 4, count: 3 });
  });

  it('devuelve { average: null, count: 0 } cuando una sucursal no tiene reseñas', async () => {
    const branchId = await createBranch('branch-review-empty');

    const response = await request(app.getHttpServer())
      .get(`/api/v1/branches/${branchId}/rating`)
      .expect(200);

    expect(response.body).toEqual({ average: null, count: 0 });
  });
});
