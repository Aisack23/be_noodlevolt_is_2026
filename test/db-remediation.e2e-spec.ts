import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { Client } from 'pg';
import request from 'supertest';
import { accessTokenFor } from './support/access-token.js';

describe('Remediación de reservas, compras e inventario', () => {
  const prefix = '/api/v1';
  const ids = { branch: randomUUID(), other: randomUUID(), ingredient: randomUUID() };
  const cronSecret = randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', '');
  const users = new Map<string, { id: string; token: string }>();
  let app: INestApplication;
  let db: Client;
  let stockId: string;
  let otherStockId: string;
  let tableId: string;
  let dishId: string;

  function actor(role: string) {
    return users.get(role)!;
  }

  function api(role?: string) {
    const http = request(app.getHttpServer());
    const auth = (test: ReturnType<typeof http.get>) => role ? test.auth(actor(role).token, { type: 'bearer' }) : test;
    return {
      get: (path: string) => auth(http.get(prefix + path)),
      post: (path: string) => auth(http.post(prefix + path)),
      patch: (path: string) => auth(http.patch(prefix + path)),
    };
  }

  beforeAll(async () => {
    process.env.JWT_SECRET ??= randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', '');
    process.env.CRON_SECRET = cronSecret;
    const { AppModule } = await import('../src/app.module.js');
    const { configureApp } = await import('../src/configure-app.js');
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication({ bodyParser: false });
    configureApp(app);
    await app.init();
    db = new Client({ connectionString: process.env.DATABASE_URL });
    await db.connect();
    for (const branch of [ids.branch, ids.other]) {
      await db.query('INSERT INTO branches (id,name,address) VALUES ($1,$2,\'Local\')', [branch, branch]);
      await db.query('INSERT INTO branch_configs (id,branch_id,is_open) VALUES ($1,$2,true)', [randomUUID(), branch]);
    }

    const jwt = module.get(JwtService);
    for (const [key, role, branchId] of [
      ['client', 'CLIENT', null], ['admin', 'BRANCH_ADMIN', ids.branch],
      ['other', 'BRANCH_ADMIN', ids.other], ['general', 'GENERAL_MANAGER', null], ['waiter', 'WAITER', ids.branch],
      ['cook', 'COOK', ids.branch], ['cashier', 'CASHIER', ids.branch],
    ] as const) {
      const id = randomUUID();
      await db.query(
        "INSERT INTO users (id,name,email,password_hash,role,branch_id,updated_at) VALUES ($1,'Prueba',$2,'unused',$3,$4,now())",
        [id, `${id}@example.com`, role, branchId],
      );
      users.set(key, { id, token: await accessTokenFor(db, jwt, id) });
    }

    tableId = randomUUID();
    await db.query('INSERT INTO tables (id,branch_id,number,capacity) VALUES ($1,$2,\'1\',4)', [tableId, ids.branch]);
    const categoryId = randomUUID();
    await db.query('INSERT INTO categories (id,branch_id,name) VALUES ($1,$2,\'Menú\')', [categoryId, ids.branch]);
    dishId = randomUUID();
    await db.query('INSERT INTO dishes (id,branch_id,category_id,name,price) VALUES ($1,$2,$3,\'Ramen\',8.50)', [dishId, ids.branch, categoryId]);
    await db.query('INSERT INTO ingredients (id,name,unit) VALUES ($1,$2,\'kg\')', [ids.ingredient, ids.ingredient]);
    stockId = randomUUID();
    otherStockId = randomUUID();
    await db.query(
      'INSERT INTO branch_ingredients (id,branch_id,ingredient_id,current_stock,minimum_stock) VALUES ($1,$2,$3,0,4),($4,$5,$3,10,4)',
      [stockId, ids.branch, ids.ingredient, otherStockId, ids.other],
    );
    await db.query('INSERT INTO recipes (dish_id,ingredient_id,quantity) VALUES ($1,$2,2)', [dishId, ids.ingredient]);
  }, 15000);

  afterAll(async () => {
    await app?.close();
    if (!db) return;
    const branches = [ids.branch, ids.other];
    await db.query('DELETE FROM reservations WHERE branch_id=ANY($1)', [branches]);
    await db.query('DELETE FROM inventory_movements WHERE branch_ingredient_id=ANY($1)', [[stockId, otherStockId].filter(Boolean)]);
    await db.query('DELETE FROM purchases WHERE branch_id=ANY($1)', [branches]);
    await db.query('DELETE FROM orders WHERE branch_id=ANY($1)', [branches]);
    await db.query('DELETE FROM accounts WHERE branch_id=ANY($1)', [branches]);
    await db.query('DELETE FROM dishes WHERE branch_id=ANY($1)', [branches]);
    await db.query('DELETE FROM categories WHERE branch_id=ANY($1)', [branches]);
    await db.query('DELETE FROM branch_ingredients WHERE branch_id=ANY($1)', [branches]);
    await db.query('DELETE FROM ingredients WHERE id=$1', [ids.ingredient]);
    await db.query('DELETE FROM tables WHERE branch_id=ANY($1)', [branches]);
    await db.query('DELETE FROM users WHERE id=ANY($1)', [[...users.values()].map((user) => user.id)]);
    await db.query('DELETE FROM branches WHERE id=ANY($1)', [branches]);
    await db.end();
  });

  it('cancela de forma idempotente, auditada y con alcance de sucursal', async () => {
    const startsAt = new Date(Date.now() + 48 * 3600000);
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/El_Salvador' }).format(startsAt);
    const booking = await api('client').post('/reservations').send({
      branchId: ids.branch, tableId, startsAt: startsAt.toISOString(),
      guests: 2, contactName: 'Contacto administrativo', phone: '+50370000000',
    }).expect(201);
    const listing = `/reservations/branches/${ids.branch}/reservations?date=${date}`;
    const reservation = `/reservations/${booking.body.id}/cancel`;

    for (const role of ['waiter', 'cook', 'cashier']) {
      const result = await api(role).get(listing).expect(200);
      expect(Object.keys(result.body[0]).sort()).toEqual(['alias', 'endsAt', 'guests', 'startsAt', 'tableNumber']);
      await api(role).patch(reservation).expect(403);
    }
    const adminList = await api('admin').get(listing).expect(200);
    expect(adminList.body[0]).toMatchObject({ id: booking.body.id, phone: '+50370000000', tableNumber: '1' });
    await api('other').patch(reservation).expect(404);
    await api('admin').patch(reservation).expect(200, { id: booking.body.id, status: 'CANCELED' });
    await api('general').patch(reservation).expect(200);
    const [audit] = (await db.query(
      'SELECT canceled_by, canceled_at FROM reservations WHERE id=$1', [booking.body.id],
    )).rows;
    expect(audit).toMatchObject({ canceled_by: actor('admin').id, canceled_at: expect.any(Date) });
    const operational = await api('waiter').get(listing).expect(200);
    expect(operational.body).toEqual([]);
  });

  it('bloquea órdenes sin insumos y refleja el mismo estado en el catálogo', async () => {
    const path = `/sucursales/${ids.branch}/menu`;
    const catalog = await api().get(path).expect(200);
    expect(catalog.body.categorias[0].platillos[0]).toMatchObject({ id: dishId, disponible: false });
    const lines = [{ dishId, quantity: 1 }];
    await api('client').post('/orders').send({ branchId: ids.branch, operationKey: randomUUID(), lines }).expect(409);
    await api('waiter').post('/orders/salon').send({ tableId, operationKey: randomUUID(), lines }).expect(409);
    const accounts = await db.query('SELECT count(*)::int AS total FROM accounts WHERE branch_id=$1', [ids.branch]);
    expect(accounts.rows[0].total).toBe(0);
  });

  it('registra compra, auditoría y existencias juntas y rechaza insumos de otra sucursal', async () => {
    const shortage = await api('admin').get('/purchases/low-stock').expect(200);
    expect(shortage.body[0]).toMatchObject({ id: stockId, currentStock: 0 });
    const line = (branchIngredientId: string) => ({ branchIngredientId, quantity: '5.500', unitCost: '2.1250' });
    const form = { supplier: 'Proveedor local', invoiceNumber: 'FAC-001', lines: [line(stockId)] };
    await api('waiter').get('/purchases').expect(403);
    await api('general').post('/purchases').send(form).expect(403);
    await api('admin').post('/purchases').send({ ...form, lines: [line(stockId), line(otherStockId)] }).expect(409);
    expect((await api('admin').get('/purchases').expect(200)).body.total).toBe(0);

    const [first, second] = await Promise.all([
      api('admin').post('/purchases').send(form),
      api('admin').post('/purchases').send(form),
    ]);
    expect([first.status, second.status].sort()).toEqual([201, 409]);
    const purchase = first.status === 201 ? first.body : second.body;
    const moves = await db.query(
      'SELECT previous_stock, resulting_stock, user_id FROM inventory_movements WHERE purchase_id=$1', [purchase.id],
    );
    expect(moves.rows).toEqual([{ previous_stock: '0.000', resulting_stock: '5.500', user_id: actor('admin').id }]);
    expect((await api('other').get('/purchases').expect(200)).body.items).toEqual([]);
    expect((await api('admin').get('/purchases/low-stock').expect(200)).body).toEqual([]);
    const menu = await api().get(`/sucursales/${ids.branch}/menu`).expect(200);
    expect(menu.body.categorias[0].platillos[0].disponible).toBe(true);

    const order = { branchId: ids.branch, operationKey: randomUUID() };
    await api('client').post('/orders').send({ ...order, lines: [{ dishId, quantity: 3 }] }).expect(409);
    await api('client').post('/orders').send({ ...order, lines: [{ dishId, quantity: 2 }] }).expect(201);
    const queue = await api('admin').get('/kitchen/orders/supervision').expect(200);
    expect(queue.body).toHaveLength(1);
    await api('admin').patch(`/kitchen/orders/${queue.body[0].id}/status`).send({ status: 'IN_PREPARATION' }).expect(403);
    expect((await api('other').get('/kitchen/orders/supervision').expect(200)).body).toEqual([]);
  });

  it('ejecuta limpieza solo con el secreto de mantenimiento', async () => {
    const key = randomUUID();
    await db.query("INSERT INTO api_rate_limits (key,hits,expires_at) VALUES ($1,1,now() - interval '1 day')", [key]);
    await api().get('/internal/cleanup').expect(401);
    await api('admin').get('/internal/cleanup').expect(401);
    await api().get('/internal/cleanup').set('Authorization', `Bearer ${cronSecret}`).expect(200);
    expect((await db.query('SELECT key FROM api_rate_limits WHERE key=$1', [key])).rows).toEqual([]);
  });
});
