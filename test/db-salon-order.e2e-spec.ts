import 'dotenv/config';
import { randomBytes, randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Client } from 'pg';
import request from 'supertest';

const branchId = randomUUID();
const roomId = randomUUID();
const tableId = randomUUID();
const categoryId = randomUUID();
const dishId = randomUUID();
const waiterId = randomUUID();

describe('BE-02: pedido de salón para mesero', () => {
  let app: INestApplication;
  let db: Client;
  let token: string;

  beforeAll(async () => {
    process.env.JWT_SECRET = randomBytes(32).toString('hex');
    process.env.JWT_SECRET ??= randomBytes(32).toString('hex');
    process.env.JWT_SECRET = process.env.JWT_SECRET || randomBytes(32).toString('hex');
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
    db = new Client({ connectionString: process.env.DATABASE_URL });
    await db.connect();
    await db.query('BEGIN');
    try {
      await db.query(
        'INSERT INTO branches (id,name,address) VALUES ($1,$2,$3)',
        [branchId, 'salon-branch', 'Sucursal para dine-in'],
      );
      await db.query(
        'INSERT INTO branch_configs (id,branch_id,is_open) VALUES ($1,$2,true)',
        [randomUUID(), branchId],
      );
      await db.query(
        'INSERT INTO dining_rooms (id,branch_id,name,is_active) VALUES ($1,$2,$3,true)',
        [roomId, branchId, 'Principal'],
      );
      await db.query(
        'INSERT INTO tables (id,branch_id,number,capacity,status,room_id) VALUES ($1,$2,$3,$4,$5,$6)',
        [tableId, branchId, '12', 4, 'AVAILABLE', roomId],
      );
      await db.query(
        'INSERT INTO users (id,name,email,password_hash,role,branch_id,updated_at) VALUES ($1,$2,$3,$4,$5,$6,CURRENT_TIMESTAMP)',
        [waiterId, 'Mesero', `${waiterId}@example.com`, 'unused', 'WAITER', branchId],
      );
      await db.query(
        'INSERT INTO categories (id,branch_id,name) VALUES ($1,$2,$3)',
        [categoryId, branchId, 'Comandas'],
      );
      await db.query(
        'INSERT INTO dishes (id,branch_id,category_id,name,price) VALUES ($1,$2,$3,$4,$5)',
        [dishId, branchId, categoryId, 'Ramen', '8.50'],
      );
      await db.query('COMMIT');
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }
    const jwt = module.get(JwtService);
    token = await jwt.signAsync({ sub: waiterId });
  });

  beforeEach(async () => {
    await db.query('DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE branch_id=$1)', [branchId]);
    await db.query('DELETE FROM orders WHERE branch_id=$1', [branchId]);
    await db.query('DELETE FROM accounts WHERE branch_id=$1', [branchId]);
    await db.query('UPDATE tables SET status=$1 WHERE id=$2', ['AVAILABLE', tableId]);
    await db.query('UPDATE dining_rooms SET is_active=true WHERE id=$1', [roomId]);
    await db.query('UPDATE branch_configs SET is_open=true WHERE branch_id=$1', [branchId]);
    await db.query(
      "UPDATE dishes SET price=8.50,is_available=true,is_deleted=false,status='AVAILABLE' WHERE id=$1",
      [dishId],
    );
  });

  afterAll(async () => {
    if (db) {
      await db.query('DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE branch_id=$1)', [branchId]);
      await db.query('DELETE FROM orders WHERE branch_id=$1', [branchId]);
      await db.query('DELETE FROM accounts WHERE branch_id=$1', [branchId]);
      await db.query('DELETE FROM dishes WHERE branch_id=$1', [branchId]);
      await db.query('DELETE FROM categories WHERE branch_id=$1', [branchId]);
      await db.query('DELETE FROM tables WHERE branch_id=$1', [branchId]);
      await db.query('DELETE FROM dining_rooms WHERE branch_id=$1', [branchId]);
      await db.query('DELETE FROM branch_configs WHERE branch_id=$1', [branchId]);
      await db.query('DELETE FROM branches WHERE id=$1', [branchId]);
      await db.query('DELETE FROM users WHERE id=$1', [waiterId]);
      await db.end();
    }
    if (app) await app.close();
  });

  const post = (body: object) =>
    request(app.getHttpServer())
      .post('/api/v1/orders/salon')
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  it('crea pedido de salón, crea la cuenta abierta y devuelve la comanda del mesero', async () => {
    const payload = {
      tableId,
      operationKey: randomUUID(),
      lines: [{ dishId, quantity: 2, note: 'Sin cebolla' }],
    };
    const response = await post(payload).expect(201);
    expect(response.body).toMatchObject({
      status: 'PENDING',
      type: 'DINE_IN',
      total: '17.00',
      tableId,
      tableNumber: '12',
      waiterId,
      orderNumber: null,
      lines: [{ dishId, quantity: 2, note: 'Sin cebolla', dishName: 'Ramen' }],
    });
    const stored = await db.query(
      'SELECT waiter_id,status,type,total::text,account_id FROM orders WHERE id=$1',
      [response.body.id],
    );
    expect(stored.rows[0]).toMatchObject({
      waiter_id: waiterId,
      status: 'PENDING',
      type: 'DINE_IN',
      total: '17.00',
    });
    expect(stored.rows[0].account_id).toBeTruthy();
    const account = await db.query(
      'SELECT count(*)::int AS count FROM accounts WHERE branch_id=$1 AND table_id=$2 AND status=$3',
      [branchId, tableId, 'OPEN'],
    );
    expect(account.rows[0].count).toBe(1);
  });

  it('reintenta pedido idéntico con 200 y rechaza la misma clave con contenido distinto', async () => {
    const payload = {
      tableId,
      operationKey: randomUUID(),
      lines: [{ dishId, quantity: 1, note: 'Sin salsa' }],
    };
    const first = await post(payload).expect(201);
    const repeat = await post(payload).expect(200);
    expect(repeat.body).toEqual(first.body);
    await post({ ...payload, lines: [{ dishId, quantity: 2, note: 'Sin salsa' }] }).expect(409);
    await post({ ...payload, tableId: randomUUID() }).expect(409);
  });

  it('rechaza mesa fuera de servicio, salón inactivo y platillos no disponibles con el dishId en el error', async () => {
    await db.query('UPDATE tables SET status=$1 WHERE id=$2', ['OUT_OF_SERVICE', tableId]);
    await post({ tableId, operationKey: randomUUID(), lines: [{ dishId, quantity: 1 }] }).expect(409);
    await db.query('UPDATE tables SET status=$1 WHERE id=$2', ['AVAILABLE', tableId]);
    await db.query('UPDATE dining_rooms SET is_active=false WHERE id=$1', [roomId]);
    await post({ tableId, operationKey: randomUUID(), lines: [{ dishId, quantity: 1 }] }).expect(409);
    await db.query('UPDATE dining_rooms SET is_active=true WHERE id=$1', [roomId]);
    await db.query('UPDATE dishes SET is_available=false WHERE id=$1', [dishId]);
    const response = await post({ tableId, operationKey: randomUUID(), lines: [{ dishId, quantity: 1 }] }).expect(409);
    expect(response.body).toMatchObject({ dishId });
  });

  it('rechaza líneas duplicadas exactas y campos ajenos por validación del DTO', async () => {
    await post({
      tableId,
      operationKey: randomUUID(),
      lines: [{ dishId, quantity: 1 }, { dishId, quantity: 1 }],
    }).expect(400);
    await post({
      tableId,
      operationKey: randomUUID(),
      customerId: randomUUID(),
      lines: [{ dishId, quantity: 1 }],
    }).expect(400);
  });

  it('permite notas distintas sobre el mismo platillo pero no duplicados exactos', async () => {
    const payload = {
      tableId,
      operationKey: randomUUID(),
      lines: [
        { dishId, quantity: 1, note: 'Sin cebolla' },
        { dishId, quantity: 2, note: 'Con cebolla' },
      ],
    };
    await post(payload).expect(201);
    await post({
      tableId,
      operationKey: randomUUID(),
      lines: [
        { dishId, quantity: 1, note: 'Sin cebolla' },
        { dishId, quantity: 2, note: 'Sin cebolla' },
      ],
    }).expect(400);
  });
});

