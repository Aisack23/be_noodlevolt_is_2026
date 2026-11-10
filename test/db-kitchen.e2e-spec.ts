import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { Client } from 'pg';
import request from 'supertest';

const roles = [
  'CLIENT',
  'WAITER',
  'COOK',
  'BRANCH_ADMIN',
  'GENERAL_MANAGER',
  'CASHIER',
  'INVENTORY_MANAGER',
] as const;
type Role = (typeof roles)[number];
type Status =
  | 'PENDING_PAYMENT'
  | 'PENDING'
  | 'CONFIRMED'
  | 'IN_PREPARATION'
  | 'READY'
  | 'DELIVERED'
  | 'CANCELED';
interface QueueOrder {
  id: string;
  orderNumber: string;
  status: string;
  items: { name: string; quantity: number; note: string }[];
}

describe.sequential('BE-03: cocina y entrega contra PostgreSQL', () => {
  let app: INestApplication;
  let client: Client;
  let jwt: JwtService;
  const branches = [randomUUID(), randomUUID()];
  const dishes = [randomUUID(), randomUUID()];
  const categories = [randomUUID(), randomUUID()];
  const actors = Object.fromEntries(
    roles.map((role) => [role, randomUUID()]),
  ) as Record<Role, string>;
  const secondCook = randomUUID();
  const secondWaiter = randomUUID();
  const userIds = [...Object.values(actors), secondCook, secondWaiter];
  const orders: string[] = [];
  const base = '/api/v1/kitchen/orders';

  function token(id: string) {
    return jwt.sign({ sub: id });
  }
  function get(path: string, actor = actors.COOK) {
    return request(app.getHttpServer())
      .get(path)
      .auth(token(actor), { type: 'bearer' });
  }
  function patch(
    id: string,
    status: 'IN_PREPARATION' | 'READY',
    actor = actors.COOK,
  ) {
    return request(app.getHttpServer())
      .patch(`${base}/${id}/status`)
      .auth(token(actor), { type: 'bearer' })
      .send({ status });
  }
  function deliver(id: string, actor = actors.WAITER) {
    return request(app.getHttpServer())
      .patch(`${base}/${id}/deliver`)
      .auth(token(actor), { type: 'bearer' });
  }

  async function order(
    status: Status = 'PENDING',
    branch = 0,
    customerId: string | null = actors.CLIENT,
    createdAt = '2026-11-09T12:00:00Z',
  ) {
    const id = randomUUID();
    orders.push(id);
    await client.query(
      `INSERT INTO orders (id,branch_id,customer_id,type,status,operation_id,order_number,created_at,updated_at)
      VALUES ($1,$2,$3,'DINE_IN',$4,$5,$6,$7,$7)`,
      [
        id,
        branches[branch],
        customerId,
        status,
        randomUUID(),
        id.slice(0, 8),
        createdAt,
      ],
    );
    const itemStatus = ['PENDING_PAYMENT', 'CONFIRMED'].includes(status)
      ? 'PENDING'
      : status;
    await client.query(
      `INSERT INTO order_items (id,order_id,dish_id,dish_name,quantity,unit_price,note,status)
      VALUES ($1,$2,$3,'Ramen',2,8.50,'Sin cebolla',$4)`,
      [randomUUID(), id, dishes[branch], itemStatus],
    );
    return id;
  }

  async function snapshot(id: string) {
    return {
      order: (await client.query('SELECT * FROM orders WHERE id=$1', [id]))
        .rows,
      items: (
        await client.query(
          'SELECT * FROM order_items WHERE order_id=$1 ORDER BY id',
          [id],
        )
      ).rows,
      history: (
        await client.query(
          'SELECT * FROM order_status_history WHERE order_id=$1 ORDER BY changed_at,id',
          [id],
        )
      ).rows,
      notifications: (
        await client.query(
          'SELECT * FROM notifications WHERE order_id=$1 ORDER BY id',
          [id],
        )
      ).rows,
    };
  }

  beforeAll(async () => {
    if (!process.env.DATABASE_URL)
      throw new Error(
        'Configurar DATABASE_URL en una base de pruebas de PostgreSQL.',
      );
    client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    for (let i = 0; i < branches.length; i++) {
      await client.query(
        "INSERT INTO branches(id,name,address) VALUES($1,$2,'Prueba BE-03')",
        [branches[i], `BE03-${branches[i]}`],
      );
      await client.query(
        "INSERT INTO categories(id,branch_id,name) VALUES($1,$2,'Prueba BE-03')",
        [categories[i], branches[i]],
      );
      await client.query(
        "INSERT INTO dishes(id,branch_id,category_id,name,price) VALUES($1,$2,$3,'Ramen',8.50)",
        [dishes[i], branches[i], categories[i]],
      );
    }
    const createUser = async (
      id: string,
      role: Role,
      branchId: string | null,
    ) => {
      await client.query(
        `INSERT INTO users(id,name,email,password_hash,role,branch_id,updated_at)
        VALUES($1,'Actor BE-03',$2,'unused',$3,$4,now())`,
        [id, `${id}@example.com`, role, branchId],
      );
    };
    for (const role of roles)
      await createUser(
        actors[role],
        role,
        role === 'CLIENT' || role === 'GENERAL_MANAGER' ? null : branches[0],
      );
    await createUser(secondCook, 'COOK', branches[0]);
    await createUser(secondWaiter, 'WAITER', branches[0]);
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
    jwt = module.get(JwtService);
  }, 20000);

  afterEach(async () => {
    await client.query(
      'DELETE FROM notifications WHERE order_id=ANY($1::uuid[])',
      [orders],
    );
    await client.query(
      'DELETE FROM order_status_history WHERE order_id=ANY($1::uuid[])',
      [orders],
    );
    await client.query(
      'DELETE FROM order_items WHERE order_id=ANY($1::uuid[])',
      [orders],
    );
    await client.query('DELETE FROM orders WHERE id=ANY($1::uuid[])', [orders]);
    orders.length = 0;
  });
  afterAll(async () => {
    if (app) await app.close();
    if (client) {
      try {
        await client.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [
          userIds,
        ]);
        await client.query('DELETE FROM dishes WHERE id=ANY($1::uuid[])', [
          dishes,
        ]);
        await client.query('DELETE FROM categories WHERE id=ANY($1::uuid[])', [
          categories,
        ]);
        await client.query('DELETE FROM branches WHERE id=ANY($1::uuid[])', [
          branches,
        ]);
      } finally {
        await client.end();
      }
    }
  });

  it('401 sin sesión en los cuatro endpoints', async () => {
    const id = await order();
    await request(app.getHttpServer()).get(base).expect(401);
    await request(app.getHttpServer()).get(`${base}/ready`).expect(401);
    await request(app.getHttpServer())
      .patch(`${base}/${id}/status`)
      .send({ status: 'READY' })
      .expect(401);
    await request(app.getHttpServer())
      .patch(`${base}/${id}/deliver`)
      .expect(401);
  });

  it.each(roles)(
    'matriz 403: %s solo accede a sus operaciones',
    async (role) => {
      const id = await order();
      const before = await snapshot(id);
      if (role !== 'COOK') {
        await get(base, actors[role]).expect(403);
        await patch(id, 'IN_PREPARATION', actors[role]).expect(403);
      }
      if (role !== 'WAITER') {
        await get(`${base}/ready`, actors[role]).expect(403);
        await deliver(id, actors[role]).expect(403);
      }
      expect(await snapshot(id)).toEqual(before);
    },
  );

  it('400 por UUID, estado inválido o campos no permitidos', async () => {
    const id = await order();
    await patch('invalid', 'READY').expect(400);
    await deliver('invalid').expect(400);
    for (const body of [
      { status: 'DELIVERED' },
      { status: 'READY', branchId: branches[1] },
      {},
    ]) {
      await request(app.getHttpServer())
        .patch(`${base}/${id}/status`)
        .auth(token(actors.COOK), { type: 'bearer' })
        .send(body)
        .expect(400);
    }
  });

  it('404 para pedidos inexistentes y de otra sucursal sin cambios', async () => {
    const foreign = await order('READY', 1);
    const before = await snapshot(foreign);
    for (const id of [foreign, randomUUID()]) {
      await patch(id, 'READY').expect(404);
      await deliver(id).expect(404);
    }
    expect(await snapshot(foreign)).toEqual(before);
  });

  it('cola de cocina: solo pendientes/en preparación propios, ascendente, con nota por línea', async () => {
    const newer = await order(
      'PENDING',
      0,
      actors.CLIENT,
      '2026-11-09T13:00:00Z',
    );
    const older = await order(
      'IN_PREPARATION',
      0,
      actors.CLIENT,
      '2026-11-09T11:00:00Z',
    );
    for (const status of [
      'READY',
      'DELIVERED',
      'CANCELED',
      'CONFIRMED',
      'PENDING_PAYMENT',
    ] as const)
      await order(status);
    await order('PENDING', 1);
    const response = await get(base).expect(200);
    const rows = response.body as QueueOrder[];
    expect(rows.map((row) => row.id)).toEqual([older, newer]);
    expect(rows[0]).toMatchObject({
      orderNumber: older.slice(0, 8),
      status: 'IN_PREPARATION',
      items: [{ name: 'Ramen', quantity: 2, note: 'Sin cebolla' }],
    });
  });

  it('cola mesero: READY propios por fecha de LISTO, fallback createdAt, entrega desaparece', async () => {
    const readyLater = await order(
      'READY',
      0,
      actors.CLIENT,
      '2026-11-09T08:00:00Z',
    );
    const readyEarlier = await order(
      'READY',
      0,
      actors.CLIENT,
      '2026-11-09T09:00:00Z',
    );
    const legacy = await order(
      'READY',
      0,
      actors.CLIENT,
      '2026-11-09T11:00:00Z',
    );
    for (const [id, time] of [
      [readyLater, '2026-11-09T12:00:00Z'],
      [readyEarlier, '2026-11-09T10:00:00Z'],
    ]) {
      await client.query(
        `INSERT INTO order_status_history(id,order_id,user_id,previous_status,new_status,changed_at)
        VALUES($1,$2,$3,'IN_PREPARATION','READY',$4)`,
        [randomUUID(), id, actors.COOK, time],
      );
    }
    for (const status of [
      'PENDING',
      'IN_PREPARATION',
      'DELIVERED',
      'CANCELED',
      'CONFIRMED',
      'PENDING_PAYMENT',
    ] as const)
      await order(status);
    await order('READY', 1);
    const response = await get(`${base}/ready`, actors.WAITER).expect(200);
    expect((response.body as QueueOrder[]).map((row) => row.id)).toEqual([
      readyEarlier,
      legacy,
      readyLater,
    ]);
    expect(response.body[0]).toMatchObject({
      orderNumber: readyEarlier.slice(0, 8),
      items: [{ name: 'Ramen', quantity: 2, note: 'Sin cebolla' }],
    });
    await deliver(readyEarlier).expect(200);
    const after = await get(`${base}/ready`, actors.WAITER).expect(200);
    expect((after.body as QueueOrder[]).map((row) => row.id)).toEqual([
      legacy,
      readyLater,
    ]);
  });

  it('secuencia completa persiste actor, timestamps, líneas e historial; reintentos 200 sin escrituras', async () => {
    const id = await order();
    const steps = [
      {
        from: 'PENDING',
        to: 'IN_PREPARATION',
        actor: actors.COOK,
        retryActor: secondCook,
      },
      {
        from: 'IN_PREPARATION',
        to: 'READY',
        actor: actors.COOK,
        retryActor: secondCook,
      },
      {
        from: 'READY',
        to: 'DELIVERED',
        actor: actors.WAITER,
        retryActor: secondWaiter,
      },
    ] as const;
    for (const [index, step] of steps.entries()) {
      const response =
        step.to === 'DELIVERED'
          ? await deliver(id).expect(200)
          : await patch(id, step.to).expect(200);
      expect(response.body).toMatchObject({
        id,
        status: step.to,
        items: [{ status: step.to, note: 'Sin cebolla' }],
      });
      const state = await snapshot(id);
      expect(state.order[0]).toMatchObject({
        status: step.to,
        updated_by: step.actor,
      });
      expect(state.order[0].updated_at.getTime()).toBeGreaterThan(
        state.order[0].created_at.getTime(),
      );
      expect(state.history).toHaveLength(index + 1);
      expect(state.history[index]).toMatchObject({
        previous_status: step.from,
        new_status: step.to,
        user_id: step.actor,
        changed_at: expect.any(Date),
      });
      const retry =
        step.to === 'DELIVERED'
          ? await deliver(id, step.retryActor).expect(200)
          : await patch(id, step.to, step.retryActor).expect(200);
      expect(retry.body).toEqual(response.body);
      expect(await snapshot(id)).toEqual(state);
    }
    const result = await snapshot(id);
    expect(result.notifications).toHaveLength(1);
    expect(result.notifications[0]).toMatchObject({
      user_id: actors.CLIENT,
      order_id: id,
      type: 'PEDIDO_LISTO',
      event_key: `PEDIDO_LISTO:${id}:${actors.CLIENT}`,
    });
    const queue = await get(base).expect(200);
    expect(queue.body).toEqual([]);
  });

  it.each([
    ['PENDING', 'READY'],
    ['READY', 'IN_PREPARATION'],
    ['DELIVERED', 'READY'],
    ['CANCELED', 'IN_PREPARATION'],
    ['CONFIRMED', 'IN_PREPARATION'],
    ['PENDING_PAYMENT', 'IN_PREPARATION'],
  ] as const)('409 cocina: %s a %s no altera datos', async (from, to) => {
    const id = await order(from);
    const before = await snapshot(id);
    await patch(id, to).expect(409);
    expect(await snapshot(id)).toEqual(before);
  });

  it.each([
    'PENDING',
    'IN_PREPARATION',
    'CANCELED',
    'CONFIRMED',
    'PENDING_PAYMENT',
  ] as const)('409 mesero: %s no se entrega', async (status) => {
    const id = await order(status);
    const before = await snapshot(id);
    await deliver(id).expect(409);
    expect(await snapshot(id)).toEqual(before);
  });

  it('sin customer_id no genera aviso al pasar a READY', async () => {
    const id = await order('IN_PREPARATION', 0, null);
    await patch(id, 'READY').expect(200);
    expect((await snapshot(id)).notifications).toEqual([]);
  });

  it('ON CONFLICT conserva un evento PEDIDO_LISTO preexistente y confirma READY', async () => {
    const id = await order('IN_PREPARATION');
    const notification = randomUUID();
    await client.query(
      `INSERT INTO notifications(id,user_id,order_id,type,event_key,title,message)
      VALUES($1,$2,$3,'PEDIDO_LISTO',$4,'Aviso existente','No reemplazar')`,
      [notification, actors.CLIENT, id, `PEDIDO_LISTO:${id}:${actors.CLIENT}`],
    );
    const before = (await snapshot(id)).notifications;
    await patch(id, 'READY').expect(200);
    const state = await snapshot(id);
    expect(state.order[0].status).toBe('READY');
    expect(state.history).toHaveLength(1);
    expect(state.notifications).toEqual(before);
  });

  it('concurrencia forzada: dos cambios bloqueados del mismo pedido registran un avance', async () => {
    const id = await order();
    const blocker = new Client({ connectionString: process.env.DATABASE_URL });
    await blocker.connect();
    let pending: Promise<request.Response>[] = [];
    let bothWaiting = false;
    try {
      await blocker.query('BEGIN');
      await blocker.query('SELECT id FROM orders WHERE id=$1 FOR UPDATE', [id]);
      pending = [
        patch(id, 'IN_PREPARATION'),
        patch(id, 'IN_PREPARATION', secondCook),
      ].map((call) => call.then((response) => response));
      const deadline = Date.now() + 4000;
      while (Date.now() < deadline) {
        const waiting = await client.query<{ n: number }>(
          `SELECT count(*)::int AS n FROM pg_stat_activity
          WHERE datname=current_database() AND pid<>$1 AND wait_event_type='Lock'
          AND (query LIKE 'SELECT id, status FROM orders%' OR query ILIKE 'UPDATE%orders%')`,
          [(await blocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid],
        );
        if (waiting.rows[0].n >= 2) {
          bothWaiting = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    } finally {
      await blocker.query('ROLLBACK');
      await blocker.end();
      const results = await Promise.all(pending);
      expect(
        bothWaiting,
        'Las dos solicitudes deben esperar el bloqueo real de PostgreSQL',
      ).toBe(true);
      expect(results.map((result) => result.status)).toEqual([200, 200]);
    }
    const state = await snapshot(id);
    expect(state.history).toHaveLength(1);
    expect([actors.COOK, secondCook]).toContain(state.history[0].user_id);
    expect(state.order[0]).toMatchObject({
      status: 'IN_PREPARATION',
      updated_by: state.history[0].user_id,
    });
  }, 15000);

  it('fallo del aviso revierte pedido, líneas, updatedBy e historial en la misma transacción', async () => {
    const id = await order('IN_PREPARATION');
    const before = await snapshot(id);
    const gate = `be03_${randomUUID().replaceAll('-', '')}`;
    await client.query(`CREATE FUNCTION "${gate}"() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.order_id='${id}'::uuid THEN RAISE EXCEPTION 'Fallo de aviso BE-03'; END IF; RETURN NEW; END $$`);
    try {
      await client.query(
        `CREATE TRIGGER "${gate}" BEFORE INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION "${gate}"()`,
      );
      await patch(id, 'READY').expect(500);
      expect(await snapshot(id)).toEqual(before);
    } finally {
      await client.query(`DROP TRIGGER IF EXISTS "${gate}" ON notifications`);
      await client.query(`DROP FUNCTION "${gate}"()`);
    }
  });

  it('DB-03: FK updatedBy rechaza usuario inexistente y ON DELETE SET NULL conserva historial', async () => {
    const id = await order();
    await expect(
      client.query('UPDATE orders SET updated_by=$1 WHERE id=$2', [
        randomUUID(),
        id,
      ]),
    ).rejects.toMatchObject({
      code: '23503',
      constraint: 'orders_updated_by_fkey',
    });
    const actor = randomUUID();
    await client.query(
      `INSERT INTO users(id,name,email,password_hash,role,branch_id,updated_at)
      VALUES($1,'Temporal',$2,'unused','COOK',$3,now())`,
      [actor, `${actor}@example.com`, branches[0]],
    );
    userIds.push(actor);
    await patch(id, 'IN_PREPARATION', actor).expect(200);
    await client.query('DELETE FROM users WHERE id=$1', [actor]);
    const state = await snapshot(id);
    expect(state.order[0].updated_by).toBeNull();
    expect(state.history).toHaveLength(1);
    expect(state.history[0]).toMatchObject({
      user_id: null,
      new_status: 'IN_PREPARATION',
    });
  });
});
