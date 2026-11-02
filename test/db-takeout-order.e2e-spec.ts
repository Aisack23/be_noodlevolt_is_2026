import 'dotenv/config';
import { randomBytes, randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Client } from 'pg';
import request from 'supertest';
import { INGREDIENT_AVAILABILITY_CHECKER } from '../src/catalog/menu/ports/index.js';
import type { IngredientAvailabilityChecker } from '../src/catalog/menu/ports/index.js';
import { INVENTORY_CONSUMER } from '../src/takeout-orders/ports/index.js';
import type { InventoryConsumer } from '../src/takeout-orders/ports/index.js';

describe.sequential('BE-2.2.1: pedido para llevar contra PostgreSQL', () => {
  const branchId = randomUUID();
  const otherBranchId = randomUUID();
  const categoryId = randomUUID();
  const customerId = randomUUID();
  const otherCustomerId = randomUUID();
  const dishId = randomUUID();
  const otherDishId = randomUUID();
  const suffix = randomUUID();
  const email = `takeout-${suffix}@example.com`;
  let app: INestApplication;
  let module: TestingModule;
  let client: Client;
  let token: string;
  let otherToken: string;

  const body = {
    sucursalId: branchId,
    modalidadPago: 'EN_CAJA',
    lineas: [{ platilloId: dishId, cantidad: 2, precioEsperado: '8.50' }],
  };

  beforeAll(async () => {
    if (!process.env.DATABASE_URL)
      throw new Error('DATABASE_URL debe apuntar al PostgreSQL de pruebas.');
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
    await client.query('BEGIN');
    try {
      for (const id of [branchId, otherBranchId])
        await client.query(
          'INSERT INTO branches (id,name,address) VALUES ($1,$2,$3)',
          [id, `Takeout ${id}`, 'Prueba'],
        );
      await client.query('INSERT INTO categories (id,name) VALUES ($1,$2)', [
        categoryId,
        `Takeout ${suffix}`,
      ]);
      for (const [id, branch, price] of [
        [dishId, branchId, '8.50'],
        [otherDishId, otherBranchId, '13.00'],
      ])
        await client.query(
          'INSERT INTO dishes (id,branch_id,category_id,name,price) VALUES ($1,$2,$3,$4,$5)',
          [id, branch, categoryId, `Ramen ${id}`, price],
        );
      for (const [id, userEmail] of [
        [customerId, email],
        [otherCustomerId, `other-${email}`],
      ])
        await client.query(
          `INSERT INTO users (id,email,name,password_hash,role,updated_at)
           VALUES ($1,$2,'Cliente','test','CLIENT',now())`,
          [id, userEmail],
        );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
    const jwt = app.get(JwtService);
    token = await jwt.signAsync({ sub: customerId, email });
    otherToken = await jwt.signAsync({
      sub: otherCustomerId,
      email: `other-${email}`,
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (client)
      await client.query(
        'DELETE FROM orders WHERE branch_id=$1 AND customer_id=ANY($2::uuid[])',
        [branchId, [customerId, otherCustomerId]],
      );
  });

  afterAll(async () => {
    if (app) await app.close();
    else if (module) await module.close();
    if (client) {
      try {
        await client.query('BEGIN');
        await client.query('DELETE FROM dishes WHERE id=ANY($1::uuid[])', [
          [dishId, otherDishId],
        ]);
        await client.query('DELETE FROM categories WHERE id=$1', [categoryId]);
        await client.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [
          [customerId, otherCustomerId],
        ]);
        await client.query('DELETE FROM branches WHERE id=ANY($1::uuid[])', [
          [branchId, otherBranchId],
        ]);
        await client.query('COMMIT');
      } finally {
        await client.end();
      }
    }
  });

  function post(key = randomUUID(), payload: object = body, bearer = token) {
    return request(app.getHttpServer())
      .post('/api/v1/pedidos-llevar')
      .set('Authorization', `Bearer ${bearer}`)
      .set('Idempotency-Key', key)
      .send(payload);
  }

  async function countOrders(key: string): Promise<number> {
    const result = await client.query<{ count: string }>(
      'SELECT count(*) FROM orders WHERE operation_id=$1',
      [key],
    );
    return Number(result.rows[0].count);
  }

  it('requiere sesión', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/pedidos-llevar')
      .send(body)
      .expect(401);
  });

  it('exige UUID en Idempotency-Key', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/pedidos-llevar')
      .set('Authorization', `Bearer ${token}`)
      .send(body)
      .expect(400);
    await post('invalid-key').expect(400);
  });

  it('rechaza carrito vacío, sucursal inválida y cantidad fuera de rango', async () => {
    await post(randomUUID(), { ...body, lineas: [] }).expect(400);
    await post(randomUUID(), { ...body, sucursalId: 'bad' }).expect(400);
    await post(randomUUID(), {
      ...body,
      lineas: [{ ...body.lineas[0], cantidad: 0 }],
    }).expect(400);
    await post(randomUUID(), { ...body, sucursalId: randomUUID() }).expect(400);
  });

  it('crea EN_CAJA con precios del servidor, total Decimal y retiro local', async () => {
    const key = randomUUID();
    const response = await post(key, {
      ...body,
      lineas: [{ ...body.lineas[0], precioEsperado: '8.5' }],
    }).expect(201);
    expect(response.body).toMatchObject({
      estado: 'PENDIENTE',
      modalidadPago: 'EN_CAJA',
      total: '17.00',
      lineas: [
        {
          nombre: `Ramen ${dishId}`,
          cantidad: 2,
          precio: '8.50',
          subtotal: '17.00',
        },
      ],
    });
    expect(response.body.horaRetiro).toMatch(/-06:00$/);
    expect(Date.parse(response.body.horaRetiro) - Date.now()).toBeGreaterThan(
      19 * 60_000,
    );
    expect(Date.parse(response.body.horaRetiro) - Date.now()).toBeLessThan(
      21 * 60_000,
    );
    const stored = await client.query<{
      unit_price: string;
      payment_mode: string;
    }>(
      `SELECT i.unit_price,o.payment_mode FROM order_items i
       JOIN orders o ON o.id=i.order_id WHERE o.operation_id=$1`,
      [key],
    );
    expect(stored.rows[0]).toMatchObject({
      unit_price: '8.50',
      payment_mode: 'AT_COUNTER',
    });
  });

  it('crea EN_LINEA en PENDIENTE_PAGO', async () => {
    const response = await post(randomUUID(), {
      ...body,
      modalidadPago: 'EN_LINEA',
    }).expect(201);
    expect(response.body).toMatchObject({
      estado: 'PENDIENTE_PAGO',
      modalidadPago: 'EN_LINEA',
    });
  });

  it('reutiliza la clave y devuelve 200 con el mismo pedido', async () => {
    const key = randomUUID();
    const first = await post(key).expect(201);
    const second = await post(key).expect(200);
    expect(second.body).toEqual(first.body);
    expect(await countOrders(key)).toBe(1);
  });

  it('rechaza la misma clave con otro contenido o cliente', async () => {
    const key = randomUUID();
    await post(key).expect(201);
    await post(key, { ...body, lineas: [{ ...body.lineas[0], cantidad: 3 }] })
      .expect(422)
      .expect(({ body: error }) =>
        expect(error.message).toContain('otro contenido'),
      );
    await post(key, body, otherToken).expect(422);
    expect(await countOrders(key)).toBe(1);
  });

  it('resuelve dos confirmaciones concurrentes de la misma clave', async () => {
    const key = randomUUID();
    const results = await Promise.all([post(key), post(key)]);
    expect(
      results
        .map((result) => result.status)
        .sort((left, right) => left - right),
    ).toEqual([200, 201]);
    expect(results[0].body.id).toBe(results[1].body.id);
    expect(await countOrders(key)).toBe(1);
  });

  it('devuelve 409 con precios actuales sin crear pedido', async () => {
    const key = randomUUID();
    await client.query('UPDATE dishes SET price=9.25 WHERE id=$1', [dishId]);
    try {
      const response = await post(key).expect(409);
      expect(response.body.preciosActuales).toEqual([
        { platilloId: dishId, precioActual: '9.25' },
      ]);
      expect(await countOrders(key)).toBe(0);
    } finally {
      await client.query('UPDATE dishes SET price=8.50 WHERE id=$1', [dishId]);
    }
  });

  it.each(['SOLD_OUT', 'DISABLED'] as const)(
    'devuelve 422 para %s sin pedido',
    async (status) => {
      const key = randomUUID();
      await client.query('UPDATE dishes SET status=$1 WHERE id=$2', [
        status,
        dishId,
      ]);
      try {
        const response = await post(key).expect(422);
        expect(response.body.platillos).toEqual([
          { platilloId: dishId, nombre: `Ramen ${dishId}` },
        ]);
        expect(await countOrders(key)).toBe(0);
      } finally {
        await client.query("UPDATE dishes SET status='AVAILABLE' WHERE id=$1", [
          dishId,
        ]);
      }
    },
  );

  it('devuelve 422 para platillo de otra sucursal', async () => {
    const key = randomUUID();
    const response = await post(key, {
      ...body,
      lineas: [
        { platilloId: otherDishId, cantidad: 1, precioEsperado: '13.00' },
      ],
    }).expect(422);
    expect(response.body.platillos).toEqual([
      { platilloId: otherDishId, nombre: null },
    ]);
    expect(await countOrders(key)).toBe(0);
  });

  it('devuelve 422 cuando faltan insumos', async () => {
    const key = randomUUID();
    const checker = app.get<IngredientAvailabilityChecker>(
      INGREDIENT_AVAILABILITY_CHECKER,
    );
    vi.spyOn(checker, 'findSufficientDishIds').mockResolvedValueOnce(new Set());
    const response = await post(key).expect(422);
    expect(response.body.platillos).toEqual([
      { platilloId: dishId, nombre: `Ramen ${dishId}` },
    ]);
    expect(await countOrders(key)).toBe(0);
  });

  it('revierte pedido y líneas si falla el consumo de insumos', async () => {
    const key = randomUUID();
    const consumer = app.get<InventoryConsumer>(INVENTORY_CONSUMER);
    vi.spyOn(consumer, 'consume').mockRejectedValueOnce(
      new Error('Consumo falló'),
    );
    await post(key).expect(500);
    expect(await countOrders(key)).toBe(0);
  });

  it('documenta 201, 200, 400, 401, 409 y 422 en Swagger', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Test').setVersion('1').build(),
    );
    const operation = document.paths['/api/v1/pedidos-llevar'].post;
    expect(operation).toBeDefined();
    for (const status of ['201', '200', '400', '401', '409', '422'])
      expect(operation?.responses).toHaveProperty(status);
    expect(JSON.stringify(operation?.responses['201'])).toContain('17.00');
  });

  it.each([
    [{ ...body, lineas: [] }, 'El carrito no puede estar vacío.'],
    [
      { ...body, modalidadPago: 'OTRA' },
      'La modalidad de pago debe ser EN_LINEA o EN_CAJA.',
    ],
    [
      { ...body, sucursalId: 'inválido' },
      'El identificador de sucursal debe ser un UUID válido.',
    ],
    [
      { ...body, lineas: [{ ...body.lineas[0], cantidad: 21 }] },
      'La cantidad debe estar entre 1 y 20.',
    ],
  ])('devuelve mensajes de validación en español', async (payload, message) => {
    const result = await post(randomUUID(), payload).expect(400);
    expect(result.body.message.join(' ')).toContain(message);
  });

  it('revalida el precio después de esperar una actualización concurrente', async () => {
    const key = randomUUID();
    await client.query('BEGIN');
    await client.query('UPDATE dishes SET price=9.25 WHERE id=$1', [dishId]);
    let finished = false;
    const pending = post(key).then((result) => {
      finished = true;
      return result;
    });
    try {
      for (let attempt = 0; attempt < 100 && !finished; attempt++) {
        const waiting = await client.query<{ blocked: boolean }>(
          `SELECT EXISTS (SELECT 1 FROM pg_stat_activity
           WHERE cardinality(pg_blocking_pids(pid)) > 0
             AND query LIKE '%FROM dishes%FOR SHARE%') AS blocked`,
        );
        if (waiting.rows[0].blocked) break;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      await client.query('COMMIT');
      const result = await pending;
      expect(result.status).toBe(409);
      expect(result.body.preciosActuales).toEqual([
        { platilloId: dishId, precioActual: '9.25' },
      ]);
      expect(await countOrders(key)).toBe(0);
    } finally {
      await client.query('ROLLBACK');
      await pending;
      await client.query('UPDATE dishes SET price=8.50 WHERE id=$1', [dishId]);
    }
  });
});
