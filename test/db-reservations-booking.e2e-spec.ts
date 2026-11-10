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
  it('dos confirmaciones simultáneas no duplican la mesa/intervalo', async () => {
    const results = await Promise.all([post(), post()]);
    expect(
      results.map((result) => result.status).sort((a, b) => a - b),
    ).toEqual([201, 409]);
    const count = await client!.query(
      'SELECT count(*)::int AS n FROM reservations WHERE branch_id=$1',
      [branches[0]],
    );
    expect(count.rows[0].n).toBe(1);
  });
  it('ignora reservaciones canceladas al calcular disponibilidad', async () => {
    const first = await post().expect(201);
    await client!.query(
      "UPDATE reservations SET status='CANCELED' WHERE id=$1",
      [first.body.id],
    );
    await post().expect(201);
  });
});
