import 'dotenv/config';
import { randomBytes, randomUUID } from 'node:crypto';
import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { hash } from 'bcrypt';
import { Client } from 'pg';
import request from 'supertest';

const PASSWORD = 'Prueba1234!';
const REPORT_RANGE = { from: '2099-01-01', to: '2099-01-02' };

describe.sequential('BE-10: endpoint /reports/sales consumible con JWT', () => {
  const branchA = randomUUID();
  const branchB = randomUUID();
  const suffix = randomUUID();
  let app: INestApplication;
  let client: Client;
  let managerToken: string;
  let generalManagerToken: string;

  async function insertOrder(branchId: string, status = 'DELIVERED') {
    const id = randomUUID();
    await client.query(
      `INSERT INTO orders (id,branch_id,type,status,operation_id,updated_at)
       VALUES ($1,$2,'DINE_IN',$3,$4,CURRENT_TIMESTAMP)`,
      [id, branchId, status, randomUUID()],
    );
    return id;
  }

  async function insertPayment(
    branchId: string,
    orderId: string,
    amount: string,
    status = 'PAID',
    createdAt = '2099-01-01T06:00:00.000Z',
  ) {
    await client.query(
      `INSERT INTO payments (id,branch_id,order_id,subtotal,total_paid,status,created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [randomUUID(), branchId, orderId, amount, status === 'PAID' ? amount : '0.00', status, createdAt],
    );
  }

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('Configurar DATABASE_URL para ejecutar la prueba HTTP del reporte de ventas.');
    }
    process.env.JWT_SECRET ??= randomBytes(32).toString('hex');
    const { AppModule } = await import('../src/app.module.js');
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    const config = new DocumentBuilder()
      .setTitle('SI Backend Boilerplate')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));
    await app.init();

    client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();

    await client.query(
      'INSERT INTO branches (id,name,address) VALUES ($1,$2,$3), ($4,$5,$6)',
      [branchA, `Branch A ${suffix}`, 'Prueba A', branchB, `Branch B ${suffix}`, 'Prueba B'],
    );

    const passwordHash = await hash(PASSWORD, 4);
    const managerId = randomUUID();
    const generalManagerId = randomUUID();
    await client.query(
      `INSERT INTO users (id,name,email,password_hash,role,branch_id,updated_at)
       VALUES ($1,$2,$3,$4,$5::"UserRole", $6, now()),
              ($7,$8,$9,$10,$11::"UserRole", $12, now())`,
      [
        managerId,
        'Manager A',
        `manager-${suffix}@example.com`,
        passwordHash,
        'BRANCH_ADMIN',
        branchA,
        generalManagerId,
        'General Manager',
        `gm-${suffix}@example.com`,
        passwordHash,
        'GENERAL_MANAGER',
        null,
      ],
    );

    const managerLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: `manager-${suffix}@example.com`, password: PASSWORD });
    managerToken = managerLogin.body.accessToken;

    const generalManagerLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: `gm-${suffix}@example.com`, password: PASSWORD });
    generalManagerToken = generalManagerLogin.body.accessToken;

    const orderA = await insertOrder(branchA);
    const orderB = await insertOrder(branchB);
    await insertPayment(branchA, orderA, '12.50', 'PAID', '2099-01-01T06:00:00.000Z');
    await insertPayment(branchB, orderB, '20.00', 'PAID', '2099-01-01T06:00:00.000Z');
  });

  afterAll(async () => {
    if (app) await app.close();
    if (client) {
      try {
        await client.query('DELETE FROM payments WHERE order_id IN (SELECT id FROM orders WHERE branch_id=ANY($1::uuid[]))', [[branchA, branchB]]);
        await client.query('DELETE FROM orders WHERE branch_id=ANY($1::uuid[])', [[branchA, branchB]]);
        await client.query('DELETE FROM users WHERE email LIKE $1', [`%${suffix}@example.com`]);
        await client.query('DELETE FROM branches WHERE id=ANY($1::uuid[])', [[branchA, branchB]]);
      } finally {
        await client.end();
      }
    }
  });

  it('devuelve el total del gerente de la sucursal y documenta el contrato en Swagger', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/reports/sales')
      .query(REPORT_RANGE)
      .auth(managerToken, { type: 'bearer' })
      .expect(200);

    expect(response.body).toMatchObject({
      from: REPORT_RANGE.from,
      to: REPORT_RANGE.to,
      branchId: branchA,
      total: '12.50',
      paymentsCount: 1,
    });

    const swagger = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('SI Backend Boilerplate').setVersion('1.0').addBearerAuth().build());
    expect(swagger.paths['/api/v1/reports/sales']).toBeDefined();
  });

  it('rechaza una sucursal ajena para BRANCH_ADMIN', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/reports/sales')
      .query({ ...REPORT_RANGE, branchId: branchB })
      .auth(managerToken, { type: 'bearer' })
      .expect(403);
  });

  it('GENERAL_MANAGER consolida todas sin branchId', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/reports/sales')
      .query(REPORT_RANGE)
      .auth(generalManagerToken, { type: 'bearer' })
      .expect(200);

    expect(response.body.branchId).toBeNull();
    expect(response.body.total).toBe('32.50');
    expect(response.body.paymentsCount).toBe(2);
  });
});
