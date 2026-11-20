import { accessTokenFor } from './support/access-token.js';
import 'dotenv/config';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Client } from 'pg';
import request from 'supertest';
import { PrismaService } from '@Prisma/services';
import { validateEnv } from '../src/config/env.validation.js';
import { configureApp } from '../src/configure-app.js';
import { RateLimitCleanupService } from '../src/security/rate-limit-cleanup.service.js';
import { HttpSecurityService } from '../src/security/http-security.service.js';
import { UsersService } from '../src/users/services/users.service.js';
import { TokenService } from '../src/auth/services/token.service.js';
import { ACCESS_TOKEN_POLICY } from '../src/auth/types/access-token-policy.js';

const users: string[] = [randomUUID(), randomUUID(), randomUUID()];
const createdUsers: string[] = [];
const branches: string[] = [randomUUID(), randomUUID()];
const order = randomUUID();
const notice = randomUUID();
const password = 'Aa1!' + randomBytes(16).toString('hex');
const emails = users.map((id) => `${id}@security.example`);

describe('Auditoría de seguridad con HTTP y PostgreSQL reales', () => {
  let primary: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  let db: Client;
  const applications: INestApplication[] = [];
  let ready = false;
  let secret: string;

  async function createApp(
    overrides: Record<string, unknown> = {},
    productionHttp = false,
  ) {
    const settings = validateEnv({
      NODE_ENV: 'test',
      DATABASE_URL: process.env.DATABASE_URL,
      JWT_SECRET: secret,
      BCRYPT_SALT_ROUNDS: 10,
      SWAGGER_ENABLED: 'false',
      RATE_LIMIT_GLOBAL: 1000,
      RATE_LIMIT_LOGIN_IP: 100,
      RATE_LIMIT_LOGIN_ACCOUNT: 300,
      RATE_LIMIT_REGISTER: 100,
      RATE_LIMIT_REFRESH: 300,
      RATE_LIMIT_WRITES: 1000,
      ...overrides,
    });
    const { AppModule } = await import('../src/app.module.js');
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ConfigService)
      .useValue(new ConfigService(settings))
      .overrideProvider(HttpSecurityService)
      .useFactory({
        factory: (database: PrismaService) =>
          new HttpSecurityService(
            database,
            new ConfigService({
              ...settings,
              NODE_ENV: productionHttp ? 'production' : settings.NODE_ENV,
            }),
          ),
        inject: [PrismaService],
      })
      .compile();
    const app = module.createNestApplication({ bodyParser: false });
    configureApp(app);
    await app.init();
    applications.push(app);
    return app;
  }

  beforeAll(async () => {
    secret = process.env.JWT_SECRET ?? randomBytes(32).toString('hex');
    process.env.JWT_SECRET = secret;
    primary = await createApp();
    prisma = primary.get(PrismaService);
    jwt = primary.get(JwtService);
    db = new Client({ connectionString: process.env.DATABASE_URL });
    await db.connect();
    const hash = await primary.get(UsersService).hashPassword(password);
    await prisma.$transaction(async (tx) => {
      await tx.branch.createMany({
        data: branches.map((id) => ({
          id,
          name: id,
          address: 'Security test',
        })),
      });
      await tx.user.createMany({
        data: users.map((id, i) => ({
          id,
          email: emails[i],
          name: 'Security',
          passwordHash: hash,
          role: i === 2 ? 'WAITER' : 'CLIENT',
          branchId: i === 2 ? branches[0] : null,
        })),
      });
      await tx.order.create({
        data: {
          id: order,
          branchId: branches[1],
          customerId: users[1],
          type: 'TAKEOUT',
          paymentMode: 'ONLINE',
          status: 'PENDING',
          total: '10.00',
        },
      });
      await tx.notification.create({
        data: {
          id: notice,
          userId: users[1],
          type: 'SECURITY_TEST',
          title: 'Privado',
          message: 'Solo para otro cliente',
        },
      });
      await tx.loyaltyAccount.create({
        data: { userId: users[1], points: 999 },
      });
    });
    ready = true;
  }, 20000);

  beforeEach(async () => {
    await prisma.apiRateLimit.deleteMany();
    await prisma.refreshToken.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.updateMany({
      where: { id: { in: users } },
      data: { isActive: true },
    });
  });

  afterEach(async () => {
    for (const app of applications.splice(1)) await app.close();
  });

  afterAll(async () => {
    try {
      if (ready) {
        await prisma.notification.delete({ where: { id: notice } });
        await prisma.order.delete({ where: { id: order } });
        await prisma.loyaltyAccount.delete({ where: { userId: users[1] } });
        await prisma.user.deleteMany({
          where: { id: { in: [...users, ...createdUsers] } },
        });
        await prisma.branch.deleteMany({ where: { id: { in: branches } } });
        await prisma.apiRateLimit.deleteMany();
      }
    } finally {
      if (db) await db.end();
      for (const app of applications) await app.close();
    }
  });

  const get = (app: INestApplication, path = '/api/v1') =>
    request(app.getHttpServer()).get(path);
  const login = (app = primary, email = emails[0]) =>
    request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password });
  const refresh = (token: string, app = primary) =>
    request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: token });
  const authorized = async (index = 0) =>
    primary
      .get(TokenService)
      .issueTokenPair(
        await prisma.user.findUniqueOrThrow({ where: { id: users[index] } }),
      );
  const proxyConfig = { TRUSTED_PROXY_CIDRS: '127.0.0.0/8,::1/128' };

  it('comparte el límite global entre dos instancias y devuelve Retry-After', async () => {
    const first = await createApp({ RATE_LIMIT_GLOBAL: 2 });
    const second = await createApp({ RATE_LIMIT_GLOBAL: 2 });
    await get(first).expect(200);
    await get(second).expect(200);
    const limited = await get(first).expect(429);
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    expect(limited.headers.ratelimit).toBeDefined();
  });

  it('la limpieza no elimina una cuota renovada mientras esperaba un bloqueo', async () => {
    const key = `cleanup:${randomUUID()}`;
    await prisma.apiRateLimit.create({
      data: { key, hits: 1, expiresAt: new Date(Date.now() - 1000) },
    });
    let transactionOpen = false;
    let cleanup: ReturnType<RateLimitCleanupService['cleanup']> | undefined;
    try {
      await db.query('BEGIN');
      transactionOpen = true;
      await db.query(
        'SELECT key FROM api_rate_limits WHERE key=$1 FOR UPDATE',
        [key],
      );
      cleanup = primary.get(RateLimitCleanupService).cleanup();
      let blocked = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        await db.query('SELECT pg_stat_clear_snapshot()');
        const result = await db.query<{ blocked: boolean }>(
          "SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND strpos(query, 'DELETE FROM api_rate_limits') > 0) AS blocked",
        );
        if (result.rows[0].blocked) {
          blocked = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(blocked).toBe(true);
      await db.query(
        "UPDATE api_rate_limits SET hits=7, expires_at=statement_timestamp()+interval '1 minute' WHERE key=$1",
        [key],
      );
      await db.query('COMMIT');
      transactionOpen = false;
      await cleanup;
      expect(
        await prisma.apiRateLimit.findUnique({ where: { key } }),
      ).toMatchObject({ hits: 7 });
    } finally {
      if (transactionOpen) await db.query('ROLLBACK');
      await cleanup;
      await prisma.apiRateLimit.deleteMany({ where: { key } });
    }
  });

  it('no evita el límite variando X-Forwarded-For cuando no hay proxy confiable', async () => {
    const app = await createApp({ RATE_LIMIT_GLOBAL: 2 });
    await get(app).set('X-Forwarded-For', '192.0.2.1').expect(200);
    await get(app).set('X-Forwarded-For', '192.0.2.2').expect(200);
    await get(app).set('X-Forwarded-For', '192.0.2.3').expect(429);
  });

  it('respeta el último salto no confiable aunque se agreguen direcciones a la izquierda', async () => {
    const app = await createApp({ ...proxyConfig, RATE_LIMIT_GLOBAL: 1 });
    await get(app)
      .set('X-Forwarded-For', '192.0.2.10, 198.51.100.5')
      .expect(200);
    await get(app)
      .set('X-Forwarded-For', '192.0.2.11, 198.51.100.5')
      .expect(429);
  });

  it('agrupa IPv6 por /64 e impide evadir el límite rotando la dirección de interfaz', async () => {
    const app = await createApp({ ...proxyConfig, RATE_LIMIT_GLOBAL: 2 });
    await get(app).set('X-Forwarded-For', '2001:db8:1234:1::1').expect(200);
    await get(app).set('X-Forwarded-For', '2001:db8:1234:1::2').expect(200);
    await get(app).set('X-Forwarded-For', '2001:db8:1234:1::3').expect(429);
    await get(app).set('X-Forwarded-For', '2001:db8:1234:2::1').expect(200);
  });

  it('aplica allowlist y rechaza una IP reenviada inválida', async () => {
    const blocked = await createApp({ IP_ALLOWLIST: '10.0.0.0/8' });
    await get(blocked).set('X-Forwarded-For', '10.1.2.3').expect(403);
    const trusted = await createApp({
      ...proxyConfig,
      IP_ALLOWLIST: '10.0.0.0/8',
    });
    await get(trusted).set('X-Forwarded-For', '10.1.2.3').expect(200);
    await get(trusted).set('X-Forwarded-For', '198.51.100.5').expect(403);
    await get(trusted).set('X-Forwarded-For', 'invalid').expect(400);
  });

  it('limita login por IP antes de repetir trabajo bcrypt', async () => {
    const app = await createApp({ RATE_LIMIT_LOGIN_IP: 2 });
    for (let i = 0; i < 2; i++)
      await login(app, `${randomUUID()}@security.example`).expect(401);
    await login(app).expect(429);
  });

  it('comparte el límite de cuenta entre IP distintas y normaliza el correo', async () => {
    const app = await createApp({
      ...proxyConfig,
      RATE_LIMIT_LOGIN_ACCOUNT: 2,
    });
    const email = `${randomUUID()}@security.example`;
    for (const [ip, value] of [
      ['192.0.2.1', email],
      ['192.0.2.2', ` ${email.toUpperCase()} `],
    ]) {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', ip)
        .send({ email: value, password })
        .expect(401);
    }
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', '192.0.2.3')
      .send({ email, password })
      .expect(429);
  });

  it('limita registro, refresh y escrituras sensibles con políticas propias', async () => {
    const app = await createApp({
      RATE_LIMIT_REGISTER: 2,
      RATE_LIMIT_REFRESH: 2,
      RATE_LIMIT_WRITES: 100,
    });
    for (let i = 0; i < 2; i++) {
      const result = await request(app.getHttpServer())
        .post('/api/v1/users')
        .send({
          name: 'Cliente',
          lastName: 'Prueba',
          email: `${randomUUID()}@security.example`,
          password,
        })
        .expect(201);
      createdUsers.push(result.body.id);
      await refresh('0'.repeat(64), app).expect(401);
    }
    await request(app.getHttpServer())
      .post('/api/v1/users')
      .send({})
      .expect(429);
    await refresh('0'.repeat(64), app).expect(429);
    await prisma.apiRateLimit.deleteMany();
    const writes = await createApp({ RATE_LIMIT_WRITES: 1 });
    await request(writes.getHttpServer())
      .post('/api/v1/reservations')
      .send({})
      .expect(401);
    await request(writes.getHttpServer())
      .post('/api/v1/orders')
      .send({})
      .expect(429);
  });

  it('recupera el cupo cuando vence y persiste identificadores HMAC sin IP ni email', async () => {
    const app = await createApp({ RATE_LIMIT_GLOBAL: 1 });
    await get(app).expect(200);
    await get(app).expect(429);
    const bucket = await prisma.apiRateLimit.findFirstOrThrow();
    expect(bucket.key).toMatch(/^global:[a-f0-9]{64}$/);
    await prisma.apiRateLimit.update({
      where: { key: bucket.key },
      data: { expiresAt: new Date(Date.now() - 10000) },
    });
    await get(app).expect(200);
    expect(
      (
        await prisma.apiRateLimit.findUniqueOrThrow({
          where: { key: bucket.key },
        })
      ).hits,
    ).toBe(1);
  });

  it('no abre acceso ilimitado si falla el almacén de límites', async () => {
    await db.query(
      'ALTER TABLE api_rate_limits RENAME TO security_unavailable_limits',
    );
    try {
      await get(primary).expect(500);
    } finally {
      await db.query(
        'ALTER TABLE security_unavailable_limits RENAME TO api_rate_limits',
      );
    }
  });

  it('CORS permite el origen exacto, rechaza comodines y no habilita cookies', async () => {
    const app = await createApp({ CORS_ORIGINS: 'https://frontend.example' });
    const allowed = await get(app)
      .set('Origin', 'https://frontend.example')
      .expect(200);
    expect(allowed.headers['access-control-allow-origin']).toBe(
      'https://frontend.example',
    );
    expect(allowed.headers['access-control-allow-credentials']).toBeUndefined();
    const denied = await get(app)
      .set('Origin', 'https://frontend.example.evil.example')
      .expect(200);
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
    const preflight = await request(app.getHttpServer())
      .options('/api/v1/auth/login')
      .set('Origin', 'https://frontend.example')
      .set('Access-Control-Request-Method', 'POST')
      .expect(204);
    expect(preflight.headers['access-control-allow-origin']).toBe(
      'https://frontend.example',
    );
  });

  it('en producción exige HTTPS y no confía en X-Forwarded-Proto desde un cliente directo', async () => {
    const direct = await createApp({}, true);
    await request(direct.getHttpServer())
      .post('/api/v1/auth/login')
      .set('X-Forwarded-Proto', 'https')
      .send({ email: emails[0], password })
      .expect(426);
    await get(direct).expect(200);
    const proxy = await createApp(proxyConfig, true);
    const result = await request(proxy.getHttpServer())
      .post('/api/v1/auth/login')
      .set('X-Forwarded-Proto', 'https')
      .send({ email: emails[0], password })
      .expect(200);
    expect(result.headers['cache-control']).toBe('no-store');
    await request(proxy.getHttpServer())
      .post('/api/v1/auth/login')
      .set('X-Forwarded-Proto', 'http')
      .send({ email: emails[0], password })
      .expect(426);
  });

  it('rechaza cuerpos enormes y JSON primitivo y no expone Swagger por defecto de esta configuración', async () => {
    await request(primary.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'x'.repeat(20000), password })
      .expect(413);
    await request(primary.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('"primitive"')
      .expect(400);
    await get(primary, '/api/docs').expect(404);
    const response = await get(primary).expect(200);
    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBeDefined();
  });

  it('rechaza inyección, objetos en email, escalamiento de rol y contraseñas multibyte excesivas', async () => {
    for (const email of ["' OR 1=1--", { $ne: null }])
      await request(primary.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password })
        .expect(400);
    await request(primary.getHttpServer())
      .post('/api/v1/users')
      .send({
        name: 'Cliente',
        lastName: 'Prueba',
        email: `${randomUUID()}@security.example`,
        password,
        role: 'GENERAL_MANAGER',
      })
      .expect(400);
    await request(primary.getHttpServer())
      .post('/api/v1/users')
      .send({
        name: 'Cliente',
        lastName: 'Prueba',
        email: `${randomUUID()}@security.example`,
        password: 'Aa1' + 'é'.repeat(35),
      })
      .expect(400);
    const pair = await authorized();
    await get(primary, '/api/v1/branches/not-a-uuid/tables')
      .set('Authorization', `Bearer ${pair.accessToken}`)
      .expect(400);
  });

  it('persiste texto con sintaxis SQL como datos sin ejecutar instrucciones', async () => {
    const name = "Robert'); DROP TABLE users;--";
    const response = await request(primary.getHttpServer())
      .post('/api/v1/users')
      .send({
        name,
        lastName: 'Prueba',
        email: `${randomUUID()}@security.example`,
        password,
      })
      .expect(201);
    createdUsers.push(response.body.id);
    const row = await prisma.user.findUniqueOrThrow({
      where: { id: response.body.id },
    });
    expect(row.name).toBe(name);
    expect(await prisma.user.count({ where: { id: { in: users } } })).toBe(3);
    expect(bcryptFields(response.body)).toBe(false);
  });

  it('emite JWT de 15 minutos, hash de refresh y respuestas que no se deben cachear', async () => {
    const result = await login().expect(200);
    expect(result.headers['cache-control']).toBe('no-store');
    expect(result.body.expiresIn).toBe(900);
    const decoded = await jwt.verifyAsync(
      result.body.accessToken,
      ACCESS_TOKEN_POLICY,
    );
    expect(decoded.exp - decoded.iat).toBe(900);
    const hashed = createHash('sha256')
      .update(result.body.refreshToken)
      .digest('hex');
    const row = await prisma.refreshToken.findUniqueOrThrow({
      where: { tokenHash: hashed },
    });
    expect(row.tokenHash).not.toBe(result.body.refreshToken);
    expect(bcryptFields(result.body)).toBe(false);
  });

  it('rechaza JWT sin exp/iat, demasiado largos, vencidos, de otro emisor/audiencia o algoritmo', async () => {
    const raw = new JwtService({
      secret,
      signOptions: {
        issuer: ACCESS_TOKEN_POLICY.issuer,
        audience: ACCESS_TOKEN_POLICY.audience,
        algorithm: 'HS256',
      },
    });
    const valid = await authorized();
    const { sid } = jwt.decode(valid.accessToken) as { sid: string };
    const bad = [
      raw.sign({ sub: users[0] }),
      raw.sign({ sub: users[0], sid }, { expiresIn: 900, noTimestamp: true }),
      raw.sign({ sub: users[0], sid }, { expiresIn: 1800 }),
      raw.sign({ sub: users[0], sid }, { expiresIn: -10 }),
      raw.sign({ sub: users[0], sid }, { expiresIn: 900, algorithm: 'HS512' }),
      raw.sign({ sub: users[0], sid }, { expiresIn: 900, audience: 'other' }),
      raw.sign({ sub: users[0], sid }, { expiresIn: 900, issuer: 'other' }),
      raw.sign({ sub: 'not-a-uuid', sid }, { expiresIn: 900 }),
      raw.sign(
        { sub: users[0], sid, iat: Math.floor(Date.now() / 1000) + 30 },
        { expiresIn: 900 },
      ),
    ];
    for (const token of bad)
      await get(primary, '/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
    const good = await authorized();
    await get(primary, '/api/v1/auth/me')
      .set('Authorization', `Bearer ${good.accessToken} trailing`)
      .expect(401);
    await get(primary, '/api/v1/auth/me')
      .set('Authorization', `Bearer ${'x'.repeat(4097)}`)
      .expect(401);
  });

  it('la identidad/rol de PostgreSQL impide leer avisos, pedidos y sucursales ajenos', async () => {
    const owner = await authorized();
    const bearer = `Bearer ${owner.accessToken}`;
    const own = await get(primary, '/api/v1/orders/me')
      .set('Authorization', bearer)
      .expect(200);
    expect(own.body.map((row: { id: string }) => row.id)).not.toContain(order);
    await request(primary.getHttpServer())
      .patch(`/api/v1/notifications/${notice}/read`)
      .set('Authorization', bearer)
      .expect(404);
    expect(
      (await prisma.notification.findUniqueOrThrow({ where: { id: notice } }))
        .isRead,
    ).toBe(false);
    await request(primary.getHttpServer())
      .post('/api/v1/payments/simulate')
      .set('Authorization', bearer)
      .send({ orderId: order, cardToken: 'test_4242' })
      .expect(403);
    const balance = await get(primary, `/api/v1/loyalty/me?userId=${users[1]}`)
      .set('Authorization', bearer)
      .expect(200);
    expect(balance.body.points).toBe(0);
    const spoofedRole = await accessTokenFor(db, jwt, users[0], {
      role: 'GENERAL_MANAGER',
      branchId: branches[1],
    });
    await get(primary, '/api/v1/inventory')
      .set('Authorization', `Bearer ${spoofedRole}`)
      .expect(403);
    const waiter = await authorized(2);
    await get(primary, `/api/v1/branches/${branches[1]}/tables`)
      .set('Authorization', `Bearer ${waiter.accessToken}`)
      .expect(403);
  });

  it('rota una vez y revoca los refresh activos cuando se detecta reúso', async () => {
    const initial = (await login().expect(200)).body;
    const next = await refresh(initial.refreshToken).expect(200);
    expect(next.body.refreshToken).not.toBe(initial.refreshToken);
    await refresh(initial.refreshToken).expect(401);
    expect(
      await prisma.refreshToken.count({
        where: { userId: users[0], revokedAt: null },
      }),
    ).toBe(0);
    await refresh(next.body.refreshToken).expect(401);
  });

  it('rechaza refresh malformado, expirado y cuenta desactivada', async () => {
    await refresh('short').expect(400);
    const initial = (await login().expect(200)).body;
    const hash = createHash('sha256')
      .update(initial.refreshToken)
      .digest('hex');
    await prisma.refreshToken.update({
      where: { tokenHash: hash },
      data: { expiresAt: new Date(Date.now() - 10000) },
    });
    await refresh(initial.refreshToken).expect(401);
    const active = (await login().expect(200)).body;
    await prisma.user.update({
      where: { id: users[0] },
      data: { isActive: false },
    });
    await refresh(active.refreshToken).expect(401);
    await get(primary, '/api/v1/auth/me')
      .set('Authorization', `Bearer ${initial.accessToken}`)
      .expect(401);
  });

  it('dos renovaciones coincidentes no generan dos refresh utilizables', async () => {
    const initial = (await login().expect(200)).body;
    await db.query(`CREATE FUNCTION security_slow_refresh() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(0.2); RETURN NEW; END $$;
      CREATE TRIGGER security_slow_refresh BEFORE INSERT ON refresh_tokens FOR EACH ROW EXECUTE FUNCTION security_slow_refresh()`);
    try {
      const results = await Promise.all([
        refresh(initial.refreshToken),
        refresh(initial.refreshToken),
      ]);
      expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([
        200, 401,
      ]);
      expect(
        await prisma.refreshToken.count({
          where: { userId: users[0], revokedAt: null },
        }),
      ).toBe(0);
    } finally {
      await db.query(
        'DROP TRIGGER security_slow_refresh ON refresh_tokens; DROP FUNCTION security_slow_refresh()',
      );
    }
  });

  it('revierte la revocación si falla la creación del reemplazo', async () => {
    const initial = (await login().expect(200)).body;
    const hash = createHash('sha256')
      .update(initial.refreshToken)
      .digest('hex');
    await db.query(`CREATE FUNCTION security_fail_refresh() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'SECURITY refresh rollback'; END $$;
      CREATE TRIGGER security_fail_refresh BEFORE INSERT ON refresh_tokens FOR EACH ROW EXECUTE FUNCTION security_fail_refresh()`);
    try {
      await refresh(initial.refreshToken).expect(500);
      expect(
        (
          await prisma.refreshToken.findUniqueOrThrow({
            where: { tokenHash: hash },
          })
        ).revokedAt,
      ).toBeNull();
      expect(
        await prisma.refreshToken.count({ where: { userId: users[0] } }),
      ).toBe(1);
    } finally {
      await db.query(
        'DROP TRIGGER security_fail_refresh ON refresh_tokens; DROP FUNCTION security_fail_refresh()',
      );
    }
    await refresh(initial.refreshToken).expect(200);
  });

  it('mantiene logout idempotente e invalida también el JWT de acceso', async () => {
    const initial = (await login().expect(200)).body;
    const current = (await refresh(initial.refreshToken).expect(200)).body;
    for (const session of [initial, current]) {
      await get(primary, '/api/v1/auth/me')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .expect(session === initial ? 401 : 200);
    }
    for (let i = 0; i < 2; i++)
      await request(primary.getHttpServer())
        .post('/api/v1/auth/logout')
        .send({ refreshToken: initial.refreshToken })
        .expect(204);
    await get(primary, '/api/v1/auth/me')
      .set('Authorization', `Bearer ${current.accessToken}`)
      .expect(401);
  });
});

function bcryptFields(value: unknown): boolean {
  return /passwordHash|tokenHash/.test(JSON.stringify(value));
}
