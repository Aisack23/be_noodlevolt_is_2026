import 'dotenv/config';
import { randomBytes, randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Client } from 'pg';
import request from 'supertest';
const branches = [randomUUID(), randomUUID()];
const actors = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];

describe.sequential('QA-10: contrato de ventas pagadas', () => {
  let app: INestApplication | undefined;
  let db: Client | undefined;
  let tokens: string[];
  let created = false;
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
    db = new Client({ connectionString: process.env.DATABASE_URL });
    await db.connect();
    await db.query('BEGIN');
    try {
      for (const [i, id] of branches.entries())
        await db.query(
          'INSERT INTO branches (id,name,address,time_zone) VALUES ($1,$2,$3,$4)',
          [
            id,
            id,
            'QA10',
            i === 0 ? 'America/El_Salvador' : 'America/New_York',
          ],
        );
      const roles = [
        'BRANCH_ADMIN',
        'BRANCH_ADMIN',
        'GENERAL_MANAGER',
        'CLIENT',
      ];
      for (const [i, id] of actors.entries())
        await db.query(
          'INSERT INTO users (id,name,email,password_hash,role,branch_id,updated_at) VALUES ($1,$2,$3,$4,$5,$6,now())',
          [
            id,
            'QA10',
            `${id}@example.com`,
            'unused',
            roles[i],
            i < 2 ? branches[i] : null,
          ],
        );
      const payments = [
        {
          branch: 0,
          amount: '10.10',
          paid: '15.10',
          tip: '5.00',
          status: 'PAID',
          order: 'PENDING',
          date: '2030-01-10T06:00:00Z',
        },
        {
          branch: 0,
          amount: '20.20',
          paid: '20.20',
          tip: '0.00',
          status: 'PAID',
          order: 'DELIVERED',
          date: '2030-01-11T05:59:59.999Z',
        },
        {
          branch: 0,
          amount: '99.99',
          paid: '0.00',
          tip: '0.00',
          status: 'REJECTED',
          order: 'PENDING',
          date: '2030-01-10T12:00:00Z',
        },
        {
          branch: 0,
          amount: '40.00',
          paid: '40.00',
          tip: '0.00',
          status: 'PAID',
          order: 'CANCELED',
          date: '2030-01-10T12:00:00Z',
        },
        {
          branch: 0,
          amount: '50.00',
          paid: '50.00',
          tip: '0.00',
          status: 'PAID',
          order: 'PENDING',
          date: '2030-01-10T05:59:59.999Z',
        },
        {
          branch: 0,
          amount: '60.00',
          paid: '60.00',
          tip: '0.00',
          status: 'PAID',
          order: 'PENDING',
          date: '2030-01-11T06:00:00Z',
        },
        {
          branch: 1,
          amount: '7.70',
          paid: '7.70',
          tip: '0.00',
          status: 'PAID',
          order: 'PENDING',
          date: '2030-01-10T05:00:00Z',
        },
      ];
      for (const payment of payments) {
        const id = randomUUID();
        await db.query(
          "INSERT INTO orders (id,branch_id,type,payment_mode,status,operation_id,updated_at) VALUES ($1,$2,'TAKEOUT','ONLINE',$3,gen_random_uuid(),now())",
          [id, branches[payment.branch], payment.order],
        );
        await db.query(
          'INSERT INTO payments (id,branch_id,order_id,subtotal,total_paid,tip,status,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
          [
            randomUUID(),
            branches[payment.branch],
            id,
            payment.amount,
            payment.paid,
            payment.tip,
            payment.status,
            payment.date,
          ],
        );
      }
      await db.query('COMMIT');
      created = true;
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }
    const jwt = module.get(JwtService);
    tokens = await Promise.all(actors.map((id) => jwt.signAsync({ sub: id })));
  });
  afterAll(async () => {
    if (app) await app.close();
    if (db) {
      try {
        if (created) {
          await db.query(
            'DELETE FROM payments WHERE branch_id=ANY($1::uuid[])',
            [branches],
          );
          await db.query('DELETE FROM orders WHERE branch_id=ANY($1::uuid[])', [
            branches,
          ]);
          await db.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [
            actors,
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
  function get(
    actor = 0,
    query: object = { from: '2030-01-10', to: '2030-01-10' },
  ) {
    return request(app!.getHttpServer())
      .get('/api/v1/reports/sales')
      .set('Authorization', `Bearer ${tokens[actor]}`)
      .query(query);
  }
  it('suma 10.10+20.20 y excluye rechazo, cancelado, propina y fechas fuera del día local', async () => {
    const response = await get().expect(200);
    expect(response.body).toMatchObject({
      from: '2030-01-10',
      to: '2030-01-10',
      branchId: branches[0],
      paymentsCount: 2,
    });
    expect(response.body.total).toBe('30.30');
  });
  it('permite indicar la sucursal propia sin alterar el total', async () => {
    const response = await get(0, {
      from: '2030-01-10',
      to: '2030-01-10',
      branchId: branches[0],
    }).expect(200);
    expect(response.body).toMatchObject({
      from: '2030-01-10',
      to: '2030-01-10',
      branchId: branches[0],
      paymentsCount: 2,
    });
    expect(response.body.total).toBe('30.30');
  });
  it('devuelve cero si no hay pagos aprobados en el rango', async () => {
    const response = await get(0, {
      from: '2030-01-12',
      to: '2030-01-12',
    }).expect(200);
    expect(response.body.total).toBe('0.00');
  });
  it('rechaza rango invertido con 400', async () => {
    await get(0, { from: '2030-01-11', to: '2030-01-10' }).expect(400);
  });
  it('impide al gerente consultar otra sucursal', async () => {
    await get(0, {
      from: '2030-01-10',
      to: '2030-01-10',
      branchId: branches[1],
    }).expect(403);
  });
  it('permite al gerente general seleccionar una sucursal y respeta su zona horaria', async () => {
    const response = await get(2, {
      from: '2030-01-10',
      to: '2030-01-10',
      branchId: branches[1],
    }).expect(200);
    expect(response.body.total).toBe('7.70');
  });
  it('consolida todas las sucursales para el gerente general', async () => {
    const response = await get(2).expect(200);
    expect(response.body).toMatchObject({ branchId: null, paymentsCount: 3 });
    expect(response.body.total).toBe('38.00');
  });
  it('usa la zona propia del gerente de la segunda sucursal', async () => {
    const response = await get(1).expect(200);
    expect(response.body.total).toBe('7.70');
  });
  it('rechaza cliente autenticado', async () => {
    await get(3).expect(403);
  });
  it('requiere sesión válida', async () => {
    await request(app!.getHttpServer())
      .get('/api/v1/reports/sales')
      .query({ from: '2030-01-10', to: '2030-01-10' })
      .expect(401);
  });
  it.each([
    { from: '2030-02-30', to: '2030-03-01' },
    { to: '2030-01-10' },
    { from: '2030-01-10', to: '2030-01-10', branchId: 'invalid' },
    { from: '2030-01-10T00:00:00Z', to: '2030-01-10' },
  ])('rechaza filtros inválidos %#', async (query) => {
    await get(0, query).expect(400);
  });
});
