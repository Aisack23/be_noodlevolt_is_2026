import 'dotenv/config';
import { randomBytes, randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Client } from 'pg';
import request from 'supertest';
import { PrismaService } from '@Prisma/services';
import { NotificationsService } from '../src/notifications/services/notifications.service.js';
const branches = [randomUUID(), randomUUID()];
const clients = [randomUUID(), randomUUID()];
const cooks = [randomUUID(), randomUUID()];
const orders = [randomUUID(), randomUUID()];
const category = randomUUID();
const dish = randomUUID();

describe.sequential('HU-09: cocina y buzón con PostgreSQL real', () => {
  let app: INestApplication | undefined;
  let db: Client | undefined;
  let prisma: PrismaService;
  let notifications: NotificationsService;
  let tokens: string[];
  let cookTokens: string[];
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
    prisma = module.get(PrismaService);
    notifications = module.get(NotificationsService);
    db = new Client({ connectionString: process.env.DATABASE_URL });
    await db.connect();
    await db.query('BEGIN');
    try {
      for (const id of branches)
        await db.query(
          'INSERT INTO branches (id,name,address) VALUES ($1,$2,$3)',
          [id, id, 'BE09'],
        );
      for (const id of clients)
        await db.query(
          "INSERT INTO users (id,name,email,password_hash,role,updated_at) VALUES ($1,'Cliente',$2,'unused','CLIENT',now())",
          [id, `${id}@example.com`],
        );
      for (const [i, id] of cooks.entries())
        await db.query(
          "INSERT INTO users (id,name,email,password_hash,role,branch_id,updated_at) VALUES ($1,'Cocina',$2,'unused','COOK',$3,now())",
          [id, `${id}@example.com`, branches[i]],
        );
      await db.query(
        'INSERT INTO categories (id,branch_id,name) VALUES ($1,$2,$3)',
        [category, branches[0], 'Platos'],
      );
      await db.query(
        'INSERT INTO dishes (id,branch_id,category_id,name,price) VALUES ($1,$2,$3,$4,8.50)',
        [dish, branches[0], category, 'Ramen'],
      );
      await db.query('COMMIT');
      fixtures = true;
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }
    const jwt = module.get(JwtService);
    tokens = await Promise.all(clients.map((id) => jwt.signAsync({ sub: id })));
    cookTokens = await Promise.all(
      cooks.map((id) => jwt.signAsync({ sub: id })),
    );
  });
  beforeEach(async () => {
    await db!.query(
      'DELETE FROM notifications WHERE order_id=ANY($1::uuid[])',
      [orders],
    );
    await db!.query(
      'DELETE FROM order_status_history WHERE order_id=ANY($1::uuid[])',
      [orders],
    );
    await db!.query('DELETE FROM orders WHERE id=ANY($1::uuid[])', [orders]);
    for (const [i, id] of orders.entries()) {
      await db!.query(
        "INSERT INTO orders (id,branch_id,customer_id,type,payment_mode,status,operation_id,updated_at) VALUES ($1,$2,$3,'TAKEOUT','ONLINE','PENDING',gen_random_uuid(),now())",
        [id, branches[0], clients[i]],
      );
      await db!.query(
        'INSERT INTO order_items (id,order_id,dish_id,dish_name,quantity,unit_price) VALUES ($1,$2,$3,$4,1,8.50)',
        [randomUUID(), id, dish, 'Ramen'],
      );
    }
  });
  afterAll(async () => {
    if (app) await app.close();
    if (db) {
      try {
        if (fixtures) {
          await db.query(
            'DELETE FROM notifications WHERE user_id=ANY($1::uuid[])',
            [clients],
          );
          await db.query(
            'DELETE FROM order_status_history WHERE order_id=ANY($1::uuid[])',
            [orders],
          );
          await db.query('DELETE FROM orders WHERE id=ANY($1::uuid[])', [
            orders,
          ]);
          await db.query('DELETE FROM dishes WHERE id=$1', [dish]);
          await db.query('DELETE FROM categories WHERE id=$1', [category]);
          await db.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [
            [...clients, ...cooks],
          ]);
          await db.query('DELETE FROM branches WHERE id=ANY($1::uuid[])', [
            branches,
          ]);
        }
      } finally {
        await db.end();
      }
    }
  });
  function patch(status: string, id = orders[0], token = cookTokens[0]) {
    return request(app!.getHttpServer())
      .patch(`/api/v1/kitchen/orders/${id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status });
  }
  function inbox(i = 0, query = '') {
    return request(app!.getHttpServer())
      .get(`/api/v1/notifications/me${query}`)
      .set('Authorization', `Bearer ${tokens[i]}`);
  }
  async function ready(id = orders[0]) {
    await patch('IN_PREPARATION', id).expect(200);
    await patch('READY', id).expect(200);
  }
  function markRead(id: string, token = tokens[0]) {
    return request(app!.getHttpServer())
      .patch(`/api/v1/notifications/${id}/read`)
      .set('Authorization', `Bearer ${token}`);
  }
  it('consultar no marca leído y PATCH baja unreadCount sin cambiar total', async () => {
    await ready();
    const first = await inbox().expect(200);
    expect(first.body).toMatchObject({ total: 1, unreadCount: 1 });
    const again = await inbox().expect(200);
    expect(again.body.items[0].isRead).toBe(false);
    const updated = await markRead(first.body.items[0].id).expect(200);
    expect(updated.body.isRead).toBe(true);
    const after = await inbox().expect(200);
    expect(after.body).toMatchObject({ total: 1, unreadCount: 0 });
    expect(after.body.items[0].isRead).toBe(true);
  });
  it('es idempotente bajo reintentos concurrentes y un replay READY no vuelve a no leído', async () => {
    await ready();
    const notice = (await inbox().expect(200)).body.items[0];
    const results = await Promise.all([
      markRead(notice.id),
      markRead(notice.id),
    ]);
    expect(results.map((item) => item.status)).toEqual([200, 200]);
    await patch('READY').expect(200);
    const after = await inbox().expect(200);
    expect(after.body).toMatchObject({ total: 1, unreadCount: 0 });
    expect(after.body.items[0]).toMatchObject({ id: notice.id, isRead: true });
  });
  it('no permite leer avisos ajenos y no filtra si el ID existe', async () => {
    await ready(orders[1]);
    const other = (await inbox(1).expect(200)).body.items[0];
    await markRead(other.id).expect(404);
    await markRead(randomUUID()).expect(404);
    expect((await inbox(1).expect(200)).body).toMatchObject({ unreadCount: 1 });
    const persisted = await db!.query(
      'SELECT is_read FROM notifications WHERE id=$1',
      [other.id],
    );
    expect(persisted.rows[0].is_read).toBe(false);
  });
  it('el contador es del buzón completo, independiente de la página', async () => {
    await ready();
    const secondOrder = randomUUID();
    await db!.query(
      "INSERT INTO orders (id,branch_id,customer_id,type,payment_mode,status,operation_id,updated_at) VALUES ($1,$2,$3,'TAKEOUT','ONLINE','READY',gen_random_uuid(),now())",
      [secondOrder, branches[0], clients[0]],
    );
    try {
      await prisma.$transaction((tx) =>
        notifications.notifyOrderReady(secondOrder, tx),
      );
      const page = await inbox(0, '?limit=1&page=1').expect(200);
      expect(page.body.items).toHaveLength(1);
      expect(page.body).toMatchObject({ total: 2, unreadCount: 2 });
      await markRead(page.body.items[0].id).expect(200);
      expect(
        (await inbox(0, '?limit=1&page=2').expect(200)).body,
      ).toMatchObject({ total: 2, unreadCount: 1 });
    } finally {
      await db!.query('DELETE FROM notifications WHERE order_id=$1', [
        secondOrder,
      ]);
      await db!.query('DELETE FROM orders WHERE id=$1', [secondOrder]);
    }
  });

  it('muestra el aviso de READY con referencia al pedido solo a su propietario', async () => {
    await ready();
    await ready(orders[1]);
    const response = await inbox().expect(200);
    expect(response.body.total).toBe(1);
    expect(response.body.items[0]).toMatchObject({
      type: 'PEDIDO_LISTO',
      orderId: orders[0],
      isRead: false,
    });
    expect(response.body.items[0].message).toContain(branches[0]);
    expect(response.body.items[0]).not.toHaveProperty('userId');
    const other = await inbox(1).expect(200);
    expect(other.body.items[0].orderId).toBe(orders[1]);
  });
  it('buzón vacío tiene items=[] y total=0', async () => {
    await inbox().expect(200, {
      items: [],
      total: 0,
      unreadCount: 0,
      page: 1,
      limit: 20,
    });
  });
  it('no notifica durante preparación ni al rechazar una transición', async () => {
    await patch('READY').expect(409);
    await patch('IN_PREPARATION').expect(200);
    expect((await inbox().expect(200)).body.total).toBe(0);
  });
  it('reintentos concurrentes de READY no duplican aviso ni auditoría', async () => {
    await patch('IN_PREPARATION').expect(200);
    const results = await Promise.all([patch('READY'), patch('READY')]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect((await inbox().expect(200)).body.total).toBe(1);
    const rows = await db!.query(
      "SELECT count(*)::int AS n FROM order_status_history WHERE order_id=$1 AND new_status='READY'",
      [orders[0]],
    );
    expect(rows.rows[0].n).toBe(1);
  });
  it('el emisor interno también es idempotente en transacciones concurrentes', async () => {
    await ready();
    await Promise.all([
      prisma.$transaction((tx) =>
        notifications.notifyOrderReady(orders[0], tx),
      ),
      prisma.$transaction((tx) =>
        notifications.notifyOrderReady(orders[0], tx),
      ),
    ]);
    const rows = await db!.query(
      'SELECT count(*)::int AS n FROM notifications WHERE order_id=$1',
      [orders[0]],
    );
    expect(rows.rows[0].n).toBe(1);
  });
  it('respeta sucursal del cocinero y rol del buzón', async () => {
    await patch('IN_PREPARATION', orders[0], cookTokens[1]).expect(404);
    await request(app!.getHttpServer())
      .get('/api/v1/notifications/me')
      .set('Authorization', `Bearer ${cookTokens[0]}`)
      .expect(403);
    await request(app!.getHttpServer())
      .get('/api/v1/notifications/me')
      .expect(401);
    await inbox(0, `?userId=${clients[1]}`).expect(400);
  });
  it('pagina sin marcar los avisos como leídos', async () => {
    await ready();
    const response = await inbox(0, '?page=1&limit=1').expect(200);
    expect(response.body.items).toHaveLength(1);
    expect(response.body.total).toBe(1);
    expect(response.body.items[0].isRead).toBe(false);
  });
  it('un fallo de notificación revierte estado, líneas y auditoría', async () => {
    await patch('IN_PREPARATION').expect(200);
    const name = `be09_${randomUUID().replaceAll('-', '')}`;
    await db!.query(
      `CREATE FUNCTION "${name}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.order_id='${orders[0]}'::uuid THEN RAISE EXCEPTION 'BE09 rollback test'; END IF; RETURN NEW; END; $$`,
    );
    try {
      await db!.query(
        `CREATE TRIGGER "${name}" BEFORE INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION "${name}"()`,
      );
      await patch('READY').expect(500);
      const row = await db!.query('SELECT status FROM orders WHERE id=$1', [
        orders[0],
      ]);
      expect(row.rows[0].status).toBe('IN_PREPARATION');
      const items = await db!.query(
        'SELECT status FROM order_items WHERE order_id=$1',
        [orders[0]],
      );
      expect(items.rows[0].status).toBe('IN_PREPARATION');
      const history = await db!.query(
        "SELECT count(*)::int AS n FROM order_status_history WHERE order_id=$1 AND new_status='READY'",
        [orders[0]],
      );
      expect(history.rows[0].n).toBe(0);
      expect((await inbox().expect(200)).body.total).toBe(0);
    } finally {
      await db!.query(`DROP TRIGGER IF EXISTS "${name}" ON notifications`);
      await db!.query(`DROP FUNCTION IF EXISTS "${name}"()`);
    }
  });
});
