import 'dotenv/config';
import { randomBytes, randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Client } from 'pg';
import request from 'supertest';

const branchId = randomUUID();
const categoryId = randomUUID();
const dishId = randomUUID();
const customerId = randomUUID();
const otherCustomerId = randomUUID();

describe.sequential('BE-02: creación transaccional de pedidos', () => {
  let app: INestApplication | undefined;
  let client: Client | undefined;
  let token: string;
  let otherToken: string;
  let fixturesCreated = false;

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
        [branchId, branchId, 'Prueba BE-02'],
      );
      await client.query(
        'INSERT INTO branch_configs (id,branch_id,is_open) VALUES ($1,$2,true)',
        [randomUUID(), branchId],
      );
      for (const id of [customerId, otherCustomerId]) {
        await client.query(
          'INSERT INTO users (id,name,email,password_hash,role,updated_at) VALUES ($1,$2,$3,$4,$5,CURRENT_TIMESTAMP)',
          [id, 'Test', `${id}@example.com`, 'not-used-for-login', 'CLIENT'],
        );
      }
      await client.query(
        'INSERT INTO categories (id,branch_id,name) VALUES ($1,$2,$3)',
        [categoryId, branchId, 'Platos'],
      );
      await client.query(
        'INSERT INTO dishes (id,branch_id,category_id,name,price) VALUES ($1,$2,$3,$4,$5)',
        [dishId, branchId, categoryId, 'Ramen', '8.50'],
      );
      await client.query('COMMIT');
      fixturesCreated = true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
    const jwt = module.get(JwtService);
    token = await jwt.signAsync({ sub: customerId });
    otherToken = await jwt.signAsync({ sub: otherCustomerId });
  });

  beforeEach(async () => {
    await client!.query(
      'UPDATE branch_configs SET is_open=true WHERE branch_id=$1',
      [branchId],
    );
    await client!.query(
      "UPDATE dishes SET price=8.50,is_available=true,is_deleted=false,status='AVAILABLE' WHERE id=$1",
      [dishId],
    );
  });

  afterAll(async () => {
    if (app) await app.close();
    if (client) {
      try {
        if (fixturesCreated) {
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
          await client.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [
            [customerId, otherCustomerId],
          ]);
        }
      } finally {
        await client.end();
      }
    }
  });

  function body(operationKey = randomUUID()) {
    return { branchId, operationKey, lines: [{ dishId, quantity: 2 }] };
  }
  function post(payload: object | string, auth = token) {
    return request(app!.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${auth}`)
      .send(payload);
  }

  it.each(['ONLINE', 'AT_COUNTER'] as const)(
    'crea %s pendiente, guarda modalidad y estima retiro en 20 minutos',
    async (paymentMode) => {
      const start = Date.now();
      const response = await post({ ...body(), paymentMode }).expect(201);
      expect(response.body).toMatchObject({
        status: 'PENDING',
        paymentMode,
        total: '17.00',
      });
      const pickup = Date.parse(response.body.pickupAt);
      expect(pickup).toBeGreaterThanOrEqual(start + 20 * 60 * 1000);
      expect(pickup).toBeLessThanOrEqual(Date.now() + 20 * 60 * 1000);
      const stored = await client!.query(
        'SELECT payment_mode,status FROM orders WHERE id=$1',
        [response.body.id],
      );
      expect(stored.rows[0]).toEqual({
        payment_mode: paymentMode,
        status: 'PENDING',
      });
    },
  );

  it('precio esperado cambiado devuelve 409 con precio actual y no persiste el pedido', async () => {
    const payload = {
      ...body(),
      lines: [{ dishId, quantity: 2, expectedPrice: '7.00' }],
    };
    const response = await post(payload).expect(409);
    expect(response.body.prices).toEqual([{ dishId, currentPrice: '8.50' }]);
    const count = await client!.query(
      'SELECT count(*)::int AS count FROM orders WHERE operation_id=$1',
      [payload.operationKey],
    );
    expect(count.rows[0].count).toBe(0);
  });

  it('reintenta precio equivalente y rechaza cambiar modalidad con la misma clave', async () => {
    const payload = {
      ...body(),
      paymentMode: 'ONLINE',
      lines: [{ dishId, quantity: 2, expectedPrice: '8.5' }],
    };
    const first = await post(payload).expect(201);
    const repeated = await post({
      ...payload,
      lines: [{ dishId, quantity: 2, expectedPrice: '08.50' }],
    }).expect(200);
    expect(repeated.body).toEqual(first.body);
    await post({ ...payload, paymentMode: 'AT_COUNTER' }).expect(409);
  });

  it.each([
    'is_available=false',
    'is_deleted=true',
    "status='SOLD_OUT'",
    "status='DISABLED'",
  ])('rechaza platillo no disponible: %s', async (update) => {
    await client!.query(`UPDATE dishes SET ${update} WHERE id=$1`, [dishId]);
    await post(body()).expect(409);
  });

  it('rechaza categoría inactiva', async () => {
    await client!.query('UPDATE categories SET is_active=false WHERE id=$1', [
      categoryId,
    ]);
    try {
      await post(body()).expect(409);
    } finally {
      await client!.query('UPDATE categories SET is_active=true WHERE id=$1', [
        categoryId,
      ]);
    }
  });

  it('rechaza sucursal inexistente y platillo inexistente sin crear pedidos', async () => {
    await post({ ...body(), branchId: randomUUID() }).expect(404);
    await post({
      ...body(),
      lines: [{ dishId: randomUUID(), quantity: 1 }],
    }).expect(409);
  });

  it('persiste propietario, total y precio histórico sin confiar en el navegador', async () => {
    const response = await post(body()).expect(201);
    expect(response.body).toMatchObject({
      status: 'PENDING',
      total: '17.00',
      lines: [{ unitPrice: '8.50', quantity: 2, subtotal: '17.00' }],
    });
    const stored = await client!.query(
      'SELECT customer_id,total::text,request_hash FROM orders WHERE id=$1',
      [response.body.id],
    );
    expect(stored.rows[0]).toMatchObject({
      customer_id: customerId,
      total: '17.00',
      request_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
  });

  it('reintenta con 200 sin recalcular el pedido tras cambiar precio o cerrar sucursal', async () => {
    const payload = body();
    const first = await post(payload).expect(201);
    await client!.query('UPDATE dishes SET price=9.00 WHERE id=$1', [dishId]);
    await client!.query(
      'UPDATE branch_configs SET is_open=false WHERE branch_id=$1',
      [branchId],
    );
    const repeated = await post(payload).expect(200);
    expect(repeated.body).toEqual(first.body);
  });

  it('rechaza cambios de contenido y reutilización de la clave por otro cliente', async () => {
    const payload = body();
    await post(payload).expect(201);
    await post({ ...payload, lines: [{ dishId, quantity: 3 }] }).expect(409);
    await post(payload, otherToken).expect(409);
  });

  it('dos solicitudes simultáneas crean un solo pedido', async () => {
    const payload = body();
    const results = await Promise.all([post(payload), post(payload)]);
    expect(
      results
        .map((result) => result.status)
        .sort((left, right) => left - right),
    ).toEqual([200, 201]);
    expect(results[0].body.id).toBe(results[1].body.id);
    const count = await client!.query(
      'SELECT count(*)::int AS count FROM orders WHERE operation_id=$1',
      [payload.operationKey],
    );
    expect(count.rows[0].count).toBe(1);
  });

  it('no persiste nada si la sucursal está cerrada o el platillo no está disponible', async () => {
    const payload = body();
    await client!.query(
      'UPDATE branch_configs SET is_open=false WHERE branch_id=$1',
      [branchId],
    );
    await post(payload).expect(409);
    await client!.query(
      'UPDATE branch_configs SET is_open=true WHERE branch_id=$1',
      [branchId],
    );
    await client!.query('UPDATE dishes SET is_deleted=true WHERE id=$1', [
      dishId,
    ]);
    await post(payload).expect(409);
    const count = await client!.query(
      'SELECT count(*)::int AS count FROM orders WHERE operation_id=$1',
      [payload.operationKey],
    );
    expect(count.rows[0].count).toBe(0);
  });

  it('espera un cierre concurrente y rechaza la creación tras su confirmación', async () => {
    const closing = new Client({ connectionString: process.env.DATABASE_URL });
    await closing.connect();
    try {
      await closing.query('BEGIN');
      await closing.query(
        'UPDATE branch_configs SET is_open=false WHERE branch_id=$1',
        [branchId],
      );
      const pending = post(body()).then((response) => response);
      let waiting = false;
      for (let attempt = 0; attempt < 50; attempt++) {
        const locks = await client!.query(
          "SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%FROM branch_configs%'",
        );
        if (locks.rowCount) {
          waiting = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      await closing.query('COMMIT');
      const result = await pending;
      expect(waiting).toBe(true);
      expect(result.status).toBe(409);
    } finally {
      await closing.query('ROLLBACK');
      await closing.end();
    }
  });
});
