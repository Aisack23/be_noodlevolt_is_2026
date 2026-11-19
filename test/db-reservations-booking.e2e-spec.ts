import { accessTokenFor } from './support/access-token.js';
import 'dotenv/config';
import { randomBytes, randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Client } from 'pg';
import { PrismaService } from '../src/prisma/services/prisma.service.js';
import request from 'supertest';
const branches = [randomUUID(), randomUUID()];
const tables = [randomUUID(), randomUUID(), randomUUID()];
const userId = randomUUID();

describe('HU-04: reservación con PostgreSQL real', () => {
  let app: INestApplication | undefined;
  let client: Client | undefined;
  let token: string;
  let prisma: PrismaService;
  let created = false;
  const startsAt = new Date(Date.now() + 86400000).toISOString();
  beforeAll(async () => {
    process.env.JWT_SECRET ??= randomBytes(32).toString('hex');
    const { AppModule } = await import('../src/app.module.js');
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    prisma = module.get(PrismaService);
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
      for (const id of branches)
        await client.query(
          'INSERT INTO branches (id,name,address) VALUES ($1,$2,$3)',
          [id, id, 'Test BE-04'],
        );
      await client.query(
        'INSERT INTO users (id,name,email,password_hash,updated_at) VALUES ($1,$2,$3,$4,now())',
        [userId, 'Test', `${userId}@example.com`, 'unused'],
      );
      for (const [index, id] of tables.entries())
        await client.query(
          'INSERT INTO tables (id,branch_id,number,capacity,status) VALUES ($1,$2,$3,$4,$5)',
          [
            id,
            branches[index === 2 ? 1 : 0],
            String(index),
            index === 0 ? 4 : 6,
            index === 1 ? 'OUT_OF_SERVICE' : 'AVAILABLE',
          ],
        );
      await client.query('COMMIT');
      created = true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
    token = await accessTokenFor(client!, module.get(JwtService), userId);
  });
  beforeEach(async () => {
    await client!.query(
      'DELETE FROM reservations WHERE branch_id=ANY($1::uuid[])',
      [branches],
    );
    await client!.query(
      "UPDATE tables SET status='OUT_OF_SERVICE' WHERE id=$1",
      [tables[1]],
    );
  });
  afterAll(async () => {
    if (app) await app.close();
    if (client) {
      try {
        if (created) {
          await client.query(
            'DELETE FROM reservations WHERE branch_id=ANY($1::uuid[])',
            [branches],
          );
          await client.query('DELETE FROM tables WHERE id=ANY($1::uuid[])', [
            tables,
          ]);
          await client.query('DELETE FROM branches WHERE id=ANY($1::uuid[])', [
            branches,
          ]);
          await client.query('DELETE FROM users WHERE id=$1', [userId]);
        }
      } finally {
        await client.end();
      }
    }
  });
  function post(overrides: object = {}) {
    return request(app!.getHttpServer())
      .post('/api/v1/reservations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        branchId: branches[0],
        startsAt,
        guests: 4,
        contactName: 'Isaac',
        phone: '+50370000000',
        ...overrides,
      });
  }
  it('crea CONFIRMED con capacidad, propietario y duración correctos', async () => {
    const response = await post().expect(201);
    expect(response.body).toMatchObject({
      status: 'CONFIRMED',
      tableId: tables[0],
      guests: 4,
    });
    expect(
      Date.parse(response.body.endsAt) - Date.parse(response.body.startsAt),
    ).toBe(90 * 60000);
    const stored = await client!.query(
      'SELECT customer_id,status FROM reservations WHERE id=$1',
      [response.body.id],
    );
    expect(stored.rows[0]).toEqual({
      customer_id: userId,
      status: 'CONFIRMED',
    });
  });
  it('rechaza solapamiento total y parcial con 409', async () => {
    await post().expect(201);
    await post().expect(409);
    await post({
      startsAt: new Date(Date.parse(startsAt) + 89 * 60000).toISOString(),
    }).expect(409);
  });
  it('admite intervalos adyacentes sin solapamiento', async () => {
    await post().expect(201);
    await post({
      startsAt: new Date(Date.parse(startsAt) + 90 * 60000).toISOString(),
    }).expect(201);
  });
  it('rechaza fecha pasada sin guardar datos', async () => {
    await post({ startsAt: '2000-01-01T12:00:00Z' }).expect(400);
    const count = await client!.query(
      'SELECT count(*)::int AS n FROM reservations WHERE branch_id=$1',
      [branches[0]],
    );
    expect(count.rows[0].n).toBe(0);
  });
  it('permite reservar una mesa OCCUPIED ahora para una fecha futura sin traslapes', async () => {
    await client!.query("UPDATE tables SET status='OCCUPIED' WHERE id=$1", [
      tables[0],
    ]);
    try {
      const response = await post().expect(201);
      expect(response.body).toMatchObject({
        tableId: tables[0],
        status: 'CONFIRMED',
      });
    } finally {
      await client!.query("UPDATE tables SET status='AVAILABLE' WHERE id=$1", [
        tables[0],
      ]);
    }
  });

  it('no usa mesas de otra sucursal ni fuera de servicio', async () => {
    await post({ guests: 5 }).expect(409);
  });
  it('asigna otra mesa elegible si la primera está ocupada', async () => {
    await client!.query("UPDATE tables SET status='AVAILABLE' WHERE id=$1", [
      tables[1],
    ]);
    await post().expect(201);
    const second = await post().expect(201);
    expect(second.body.tableId).toBe(tables[1]);
  });
  it('dos confirmaciones con barrera no duplican la mesa/intervalo', async () => {
    const suffix = randomUUID().replaceAll('-', '');
    const functionName = `hu04_gate_${suffix}`;
    const triggerName = `hu04_gate_${suffix}`;
    const gateKey = Number.parseInt(suffix.slice(0, 8), 16) % 2147483647;
    const db = client!;
    let locked = false;
    let requests: Promise<request.Response>[] = [];

    await db.query(`
      CREATE FUNCTION "${functionName}"() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.table_id = '${tables[0]}'::uuid THEN
          PERFORM pg_advisory_xact_lock(404, ${gateKey});
        END IF;
        RETURN NEW;
      END;
      $$
    `);
    try {
      await db.query(`CREATE TRIGGER "${triggerName}" BEFORE INSERT ON reservations
        FOR EACH ROW EXECUTE FUNCTION "${functionName}"()`);
      await db.query('SELECT pg_advisory_lock(404, $1::int)', [gateKey]);
      locked = true;
      requests = [post(), post()].map((call) =>
        call.then((response) => response),
      );

      const deadline = Date.now() + 5000;
      let bothWaiting = false;
      while (Date.now() < deadline) {
        const waiting = await db.query<{ count: number }>(`
          SELECT count(*)::int AS count FROM pg_stat_activity
          WHERE datname=current_database() AND pid<>pg_backend_pid()
            AND wait_event_type='Lock'
            AND (query ILIKE '%INSERT%reservations%' OR query ILIKE '%FROM tables%')
        `);
        if (waiting.rows[0].count >= 2) {
          bothWaiting = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }

      await db.query('SELECT pg_advisory_unlock(404, $1::int)', [gateKey]);
      locked = false;
      const results = await Promise.all(requests);
      expect(bothWaiting).toBe(true);
      expect(
        results.map((result) => result.status).sort((a, b) => a - b),
      ).toEqual([201, 409]);
      const count = await db.query(
        'SELECT count(*)::int AS n FROM reservations WHERE branch_id=$1',
        [branches[0]],
      );
      expect(count.rows[0].n).toBe(1);
    } finally {
      if (locked)
        await db.query('SELECT pg_advisory_unlock(404, $1::int)', [gateKey]);
      await Promise.allSettled(requests);
      try {
        await db.query(
          `DROP TRIGGER IF EXISTS "${triggerName}" ON reservations`,
        );
      } finally {
        await db.query(`DROP FUNCTION IF EXISTS "${functionName}"()`);
      }
    }
  }, 15000);

  it('ignora reservaciones canceladas al calcular disponibilidad', async () => {
    const first = await post().expect(201);
    await client!.query(
      "UPDATE reservations SET status='CANCELED' WHERE id=$1",
      [first.body.id],
    );
    await post().expect(201);
  });

  function availability(overrides: object = {}) {
    return request(app!.getHttpServer())
      .get('/api/v1/reservations/availability')
      .set('Authorization', `Bearer ${token}`)
      .query({ branchId: branches[0], startsAt, guests: 4, ...overrides });
  }

  it('consulta incluye mesas sin reservas y OCCUPIED; excluye otras sucursales, capacidad y OUT_OF_SERVICE sin datos personales', async () => {
    await client!.query("UPDATE tables SET status='OCCUPIED' WHERE id=$1", [
      tables[0],
    ]);
    try {
      const response = await availability().expect(200);
      expect(response.body).toEqual([
        {
          id: tables[0],
          branchId: branches[0],
          roomId: null,
          number: '0',
          capacity: 4,
        },
      ]);
      expect((await availability({ guests: 5 }).expect(200)).body).toEqual([]);
    } finally {
      await client!.query("UPDATE tables SET status='AVAILABLE' WHERE id=$1", [
        tables[0],
      ]);
    }
  });

  it.each(['PENDING', 'CONFIRMED', 'CANCELED', 'COMPLETED', 'NO_SHOW'])(
    'disponibilidad y confirmación respetan estado %s',
    async (status) => {
      const first = await post().expect(201);
      await client!.query('UPDATE reservations SET status=$1 WHERE id=$2', [
        status,
        first.body.id,
      ]);
      const active = ['PENDING', 'CONFIRMED'].includes(status);
      const result = await availability().expect(200);
      expect(result.body.map((t: { id: string }) => t.id)).toEqual(
        active ? [] : [tables[0]],
      );
      await post({ tableId: tables[0] }).expect(active ? 409 : 201);
    },
  );

  it('consulta excluye solapamientos totales y parciales; admite ambos extremos adyacentes', async () => {
    await post().expect(201);
    for (const minutes of [-89, 0, 89]) {
      expect(
        (
          await availability({
            startsAt: new Date(
              Date.parse(startsAt) + minutes * 60000,
            ).toISOString(),
          }).expect(200)
        ).body,
      ).toEqual([]);
    }
    for (const minutes of [-90, 90]) {
      expect(
        (
          await availability({
            startsAt: new Date(
              Date.parse(startsAt) + minutes * 60000,
            ).toISOString(),
          }).expect(200)
        ).body.map((t: { id: string }) => t.id),
      ).toEqual([tables[0]]);
    }
  });

  it('selección explícita valida sucursal, capacidad, estado y existencia', async () => {
    await post({ tableId: tables[2] }).expect(409);
    await post({ tableId: tables[1] }).expect(409);
    await post({ tableId: tables[0], guests: 5 }).expect(409);
    await post({ tableId: randomUUID() }).expect(409);
    await post({ tableId: tables[0] }).expect(201);
    const count = await client!.query(
      'SELECT count(*)::int AS n FROM reservations WHERE branch_id=$1',
      [branches[0]],
    );
    expect(count.rows[0].n).toBe(1);
  });

  it('offsets equivalentes representan el mismo intervalo absoluto', async () => {
    const utc = new Date(Date.now() + 7 * 86400000);
    utc.setUTCHours(18, 0, 0, 0);
    const local = utc.toISOString().slice(0, 10) + 'T12:00:00-06:00';
    expect(Date.parse(local)).toBe(utc.getTime());
    await post({ startsAt: utc.toISOString(), tableId: tables[0] }).expect(201);
    await post({ startsAt: local, tableId: tables[0] }).expect(409);
  });

  it.each([
    { startsAt: '2000-01-01T12:00:00Z' },
    { startsAt: '2030-01-01T12:00:00' },
    { startsAt: '2030-01-01T12:00:00+24:00' },
    { startsAt: '2030-01-01T12:00:00+06:60' },
    { guests: 0 },
    { guests: 1.5 },
    { guests: 101 },
    { customerId: userId },
    { status: 'CONFIRMED' },
  ])(
    'consulta y confirmación rechazan datos inválidos sin persistir %#',
    async (invalid) => {
      await availability(invalid).expect(400);
      await post(invalid).expect(400);
      const count = await client!.query(
        'SELECT count(*)::int AS n FROM reservations WHERE branch_id=$1',
        [branches[0]],
      );
      expect(count.rows[0].n).toBe(0);
    },
  );

  it('exige sesión y rol cliente en consulta y confirmación', async () => {
    await request(app!.getHttpServer())
      .get('/api/v1/reservations/availability')
      .expect(401);
    await request(app!.getHttpServer())
      .post('/api/v1/reservations')
      .send({})
      .expect(401);
    await client!.query(
      "UPDATE users SET role='COOK', branch_id=$2 WHERE id=$1",
      [userId, branches[0]],
    );
    try {
      await availability().expect(403);
      await post().expect(403);
    } finally {
      await client!.query(
        "UPDATE users SET role='CLIENT', branch_id=null WHERE id=$1",
        [userId],
      );
    }
  });

  it('sucursal inexistente o inactiva responde 404', async () => {
    await availability({ branchId: randomUUID() }).expect(404);
    await post({ branchId: randomUUID() }).expect(404);
    await client!.query('UPDATE branches SET is_active=false WHERE id=$1', [
      branches[0],
    ]);
    try {
      await availability().expect(404);
      await post().expect(404);
    } finally {
      await client!.query('UPDATE branches SET is_active=true WHERE id=$1', [
        branches[0],
      ]);
    }
  });

  it('filtra salón y excluye salones inactivos al consultar y confirmar', async () => {
    const room = randomUUID();
    await client!.query(
      'INSERT INTO dining_rooms(id,branch_id,name) VALUES ($1,$2,$3)',
      [room, branches[0], room],
    );
    try {
      await client!.query('UPDATE tables SET room_id=$1 WHERE id=$2', [
        room,
        tables[0],
      ]);
      expect(
        (await availability({ roomId: room }).expect(200)).body.map(
          (t: { id: string }) => t.id,
        ),
      ).toEqual([tables[0]]);
      await availability({ roomId: randomUUID() }).expect(409);
      await availability({ branchId: branches[1], roomId: room }).expect(409);
      await client!.query(
        'UPDATE dining_rooms SET is_active=false WHERE id=$1',
        [room],
      );
      await availability({ roomId: room }).expect(409);
      expect((await availability().expect(200)).body).toEqual([]);
      await post({ tableId: tables[0] }).expect(409);
    } finally {
      await client!.query('UPDATE tables SET room_id=null WHERE id=$1', [
        tables[0],
      ]);
      await client!.query('DELETE FROM dining_rooms WHERE id=$1', [room]);
    }
  });

  it('PostgreSQL impide INSERT y UPDATE solapados fuera de HTTP', async () => {
    const first = await post().expect(201);
    await expect(
      client!.query(
        `INSERT INTO reservations (id, branch_id, table_id, customer_id, contact_name, phone, guests, starts_at, ends_at, status)
      SELECT $1,branch_id,table_id,customer_id,contact_name,phone,guests,starts_at,ends_at,'PENDING' FROM reservations WHERE id=$2`,
        [randomUUID(), first.body.id],
      ),
    ).rejects.toMatchObject({
      code: '23P01',
      constraint: 'reservations_no_active_overlap',
    });
    const second = await post({
      startsAt: new Date(Date.parse(startsAt) + 90 * 60000).toISOString(),
    }).expect(201);
    await expect(
      client!.query('UPDATE reservations SET starts_at=$1 WHERE id=$2', [
        startsAt,
        second.body.id,
      ]),
    ).rejects.toMatchObject({ code: '23P01' });
  });

  it('una mesa bloqueada no bloquea confirmar otra mesa de la misma sucursal', async () => {
    const suffix = randomUUID().replaceAll('-', '');
    const gate = `hu04_independent_${suffix}`;
    const gateKey = Number.parseInt(suffix.slice(0, 8), 16) % 2147483647;
    const db = client!;
    let locked = false;
    let first: Promise<request.Response> | undefined;
    await db.query(`CREATE FUNCTION "${gate}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.table_id='${tables[0]}'::uuid THEN PERFORM pg_advisory_xact_lock(405, ${gateKey}); END IF; RETURN NEW; END; $$`);
    try {
      await db.query(
        `CREATE TRIGGER "${gate}" BEFORE INSERT ON reservations FOR EACH ROW EXECUTE FUNCTION "${gate}"()`,
      );
      await db.query("UPDATE tables SET status='AVAILABLE' WHERE id=$1", [
        tables[1],
      ]);
      await db.query('SELECT pg_advisory_lock(405,$1::int)', [gateKey]);
      locked = true;
      first = post({ tableId: tables[0] }).then((response) => response);
      let waiting = false;
      const deadline = Date.now() + 4000;
      while (Date.now() < deadline) {
        const result = await db.query(
          `SELECT 1 FROM pg_locks WHERE locktype='advisory' AND classid=405 AND objid=$1 AND NOT granted`,
          [gateKey],
        );
        if (result.rowCount) {
          waiting = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      expect(waiting).toBe(true);
      await post({ tableId: tables[1] }).timeout(2000).expect(201);
      await db.query('SELECT pg_advisory_unlock(405,$1::int)', [gateKey]);
      locked = false;
      expect((await first).status).toBe(201);
    } finally {
      if (locked)
        await db.query('SELECT pg_advisory_unlock(405,$1::int)', [gateKey]);
      if (first) await Promise.allSettled([first]);
      try {
        await db.query(`DROP TRIGGER IF EXISTS "${gate}" ON reservations`);
      } finally {
        await db.query(`DROP FUNCTION IF EXISTS "${gate}"()`);
      }
    }
  }, 15000);
  it('traduce la violación real de exclusión de Prisma a 409', async () => {
    await post().expect(201);
    const failure = await prisma.reservation
      .create({
        data: {
          branchId: branches[0],
          tableId: tables[0],
          customerId: userId,
          contactName: 'Test',
          phone: '+50370000000',
          guests: 4,
          startsAt: new Date(startsAt),
          endsAt: new Date(Date.parse(startsAt) + 90 * 60000),
          status: 'CONFIRMED',
        },
      })
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(Error);
    const transaction = vi
      .spyOn(prisma, '$transaction')
      .mockRejectedValueOnce(failure);
    try {
      await post().expect(409);
    } finally {
      transaction.mockRestore();
    }
  });
});
