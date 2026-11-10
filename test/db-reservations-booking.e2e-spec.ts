import 'dotenv/config';
import { randomBytes, randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Client } from 'pg';
import request from 'supertest';
const branches = [randomUUID(), randomUUID()];
const tables = [randomUUID(), randomUUID(), randomUUID()];
const userId = randomUUID();

describe.sequential('HU-04: reservación con PostgreSQL real', () => {
  let app: INestApplication | undefined;
  let client: Client | undefined;
  let token: string;
  let created = false;
  const startsAt = new Date(Date.now() + 86400000).toISOString();
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
    token = await module.get(JwtService).signAsync({ sub: userId });
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
