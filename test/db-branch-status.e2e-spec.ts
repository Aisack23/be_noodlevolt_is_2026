import 'dotenv/config';
import { randomBytes, randomUUID } from 'node:crypto';
import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { hash } from 'bcrypt';
import { Client } from 'pg';
import request from 'supertest';
import { BranchNotFoundError } from '../src/branches/config/errors/index.js';
import { BranchConfigRepository } from '../src/branches/config/repositories/index.js';
import { PrismaService } from '../src/prisma/services/index.js';

const PASSWORD = 'Prueba1234!';
const FORBIDDEN = 'Solo el gerente de la sucursal puede cambiar su estado.';

interface ConfigRow {
  is_open: boolean;
  updated_by: string | null;
  updated_at: Date;
}

describe.sequential('BE-11: estado de sucursal contra PostgreSQL', () => {
  const branchA = randomUUID();
  const branchB = randomUUID();
  const inactiveBranch = randomUUID();
  const suffix = randomUUID();
  const actors = {
    manager: { role: 'BRANCH_ADMIN', branchId: branchA },
    otherManager: { role: 'BRANCH_ADMIN', branchId: branchB },
    inactiveManager: { role: 'BRANCH_ADMIN', branchId: inactiveBranch },
    client: { role: 'CLIENT', branchId: null },
    waiter: { role: 'WAITER', branchId: branchA },
    generalManager: { role: 'GENERAL_MANAGER', branchId: null },
  };
  type Actor = keyof typeof actors;
  const userIds = new Map<Actor, string>();
  const tokens = new Map<Actor, string>();
  let app: INestApplication;
  let module: TestingModule;
  let client: Client;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL)
      throw new Error(
        'Configurar DATABASE_URL y aplicar las migraciones en PostgreSQL de Docker.',
      );
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
    for (const [name, id, isActive] of [
      ['A', branchA, true],
      ['B', branchB, true],
      ['Inactiva', inactiveBranch, false],
    ] as const) {
      await client.query(
        'INSERT INTO branches (id,name,address,is_active) VALUES ($1,$2,$3,$4)',
        [id, `Estado ${name} ${suffix}`, 'Prueba', isActive],
      );
      await client.query(
        'INSERT INTO branch_configs (id,branch_id) VALUES ($1,$2)',
        [randomUUID(), id],
      );
    }
    const passwordHash = await hash(PASSWORD, 4);
    for (const [actor, { role, branchId }] of Object.entries(actors)) {
      const id = randomUUID();
      const email = `be11-${actor.toLowerCase()}-${suffix}@example.com`;
      await client.query(
        `INSERT INTO users (id,name,email,password_hash,role,branch_id,updated_at)
         VALUES ($1,$2,$3,$4,$5::"UserRole",$6,now())`,
        [id, actor, email, passwordHash, role, branchId],
      );
      userIds.set(actor as Actor, id);
      const login = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: PASSWORD });
      const { accessToken } = login.body as { accessToken: string };
      tokens.set(actor as Actor, accessToken);
    }
  });

  beforeEach(async () => {
    await client.query(
      // Fecha fija: Prisma fecha con el reloj del host y Docker con el suyo.
      `UPDATE branch_configs SET is_open=true,updated_by=NULL,updated_at='2000-01-01'
       WHERE branch_id=ANY($1::uuid[])`,
      [[branchA, branchB, inactiveBranch]],
    );
  });

  afterAll(async () => {
    if (app) await app.close();
    else if (module) await module.close();
    if (client) {
      try {
        await client.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [
          [...userIds.values()],
        ]);
        await client.query('DELETE FROM branches WHERE id=ANY($1::uuid[])', [
          [branchA, branchB, inactiveBranch],
        ]);
      } finally {
        await client.end();
      }
    }
  });

  function patch(actor: Actor | null, branchId: string, body: object) {
    const call = request(app.getHttpServer())
      .patch(`/api/v1/branches/${branchId}/config`)
      .send(body);
    return actor
      ? call.auth(tokens.get(actor) ?? '', { type: 'bearer' })
      : call;
  }

  async function config(branchId: string): Promise<ConfigRow | undefined> {
    const { rows } = await client.query<ConfigRow>(
      'SELECT is_open,updated_by,updated_at FROM branch_configs WHERE branch_id=$1',
      [branchId],
    );
    return rows[0];
  }

  describe('PATCH /branches/:id/config', () => {
    it('el gerente cierra su sucursal y queda la auditoría', async () => {
      const before = await config(branchA);
      const response = await patch('manager', branchA, {
        isOpen: false,
      }).expect(200);
      const stored = await config(branchA);
      expect(stored?.is_open).toBe(false);
      expect(stored?.updated_by).toBe(userIds.get('manager'));
      expect(stored?.updated_at.getTime()).toBeGreaterThan(
        before?.updated_at.getTime() ?? Number.POSITIVE_INFINITY,
      );
      expect(response.body).toEqual({
        isOpen: false,
        updatedAt: stored?.updated_at.toISOString(),
        updatedBy: userIds.get('manager'),
      });
    });

    it('el gerente reabre su sucursal', async () => {
      await patch('manager', branchA, { isOpen: false }).expect(200);
      await patch('manager', branchA, { isOpen: true }).expect(200);
      expect((await config(branchA))?.is_open).toBe(true);
    });

    it('crea la configuración si la sucursal activa no la tiene', async () => {
      await client.query('DELETE FROM branch_configs WHERE branch_id=$1', [
        branchA,
      ]);
      try {
        await patch('manager', branchA, { isOpen: false }).expect(200);
        expect((await config(branchA))?.updated_by).toBe(
          userIds.get('manager'),
        );
      } finally {
        await client.query(
          'INSERT INTO branch_configs (id,branch_id) VALUES ($1,$2) ON CONFLICT (branch_id) DO NOTHING',
          [randomUUID(), branchA],
        );
      }
    });

    it.each<[string, Actor]>([
      ['un gerente de otra sucursal', 'otherManager'],
      ['un cliente', 'client'],
      ['otro rol de la misma sucursal', 'waiter'],
      ['el gerente general', 'generalManager'],
    ])('rechaza con 403 a %s sin modificar nada', async (_name, actor) => {
      const before = await config(branchA);
      await patch(actor, branchA, { isOpen: false })
        .expect(403)
        .expect(({ body }) => {
          expect(body.message).toBe(FORBIDDEN);
        });
      expect(await config(branchA)).toEqual(before);
    });

    it('un gerente trasladado pierde el acceso aunque su token siga vigente', async () => {
      const id = userIds.get('manager');
      await client.query('UPDATE users SET branch_id=$1 WHERE id=$2', [
        branchB,
        id,
      ]);
      try {
        const before = await config(branchA);
        await patch('manager', branchA, { isOpen: false }).expect(403);
        expect(await config(branchA)).toEqual(before);
      } finally {
        await client.query('UPDATE users SET branch_id=$1 WHERE id=$2', [
          branchA,
          id,
        ]);
      }
    });

    it('no acepta la sucursal en el cuerpo y no modifica ninguna', async () => {
      const [beforeA, beforeB] = [await config(branchA), await config(branchB)];
      await patch('otherManager', branchA, {
        isOpen: false,
        branchId: branchB,
      }).expect(400);
      await patch('manager', branchA, {
        isOpen: false,
        branchId: branchA,
      }).expect(400);
      expect(await config(branchA)).toEqual(beforeA);
      expect(await config(branchB)).toEqual(beforeB);
    });

    it.each([
      ['una cadena', { isOpen: 'false' }],
      ['un número', { isOpen: 0 }],
      ['null', { isOpen: null }],
      ['un cuerpo vacío', {}],
    ])('rechaza con 400 isOpen como %s', async (_name, body) => {
      const before = await config(branchA);
      await patch('manager', branchA, body)
        .expect(400)
        .expect((response) => {
          expect(response.body.message).toEqual([
            'isOpen debe ser verdadero o falso.',
          ]);
        });
      expect(await config(branchA)).toEqual(before);
    });

    it('rechaza con 400 un id que no es UUID', async () => {
      await patch('manager', 'id-invalido', { isOpen: false })
        .expect(400)
        .expect(({ body }) => {
          expect(body.message).toBe(
            'El identificador de sucursal no es válido.',
          );
        });
    });

    it('rechaza con 401 una petición sin token', async () => {
      const before = await config(branchA);
      await patch(null, branchA, { isOpen: false }).expect(401);
      expect(await config(branchA)).toEqual(before);
    });

    it('rechaza con 401 un token inválido', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/branches/${branchA}/config`)
        .auth('token-invalido', { type: 'bearer' })
        .send({ isOpen: false })
        .expect(401);
    });

    it('responde 404 al gerente de una sucursal inactiva sin modificarla', async () => {
      const before = await config(inactiveBranch);
      await patch('inactiveManager', inactiveBranch, { isOpen: false })
        .expect(404)
        .expect(({ body }) => {
          expect(body.message).toBe('La sucursal no existe.');
        });
      expect(await config(inactiveBranch)).toEqual(before);
    });

    it('no revela a un gerente ajeno si una sucursal existe', async () => {
      await patch('otherManager', randomUUID(), { isOpen: false }).expect(403);
    });
  });

  describe('GET /branches/:id/config', () => {
    it('responde sin token y solo expone isOpen', async () => {
      await patch('manager', branchA, { isOpen: false }).expect(200);
      const response = await request(app.getHttpServer())
        .get(`/api/v1/branches/${branchA}/config`)
        .expect(200);
      expect(response.body).toEqual({ isOpen: false });
    });

    it.each([
      ['inexistente', randomUUID()],
      ['inactiva', inactiveBranch],
    ])('responde 404 para una sucursal %s', async (_name, id) => {
      await request(app.getHttpServer())
        .get(`/api/v1/branches/${id}/config`)
        .expect(404)
        .expect(({ body }) => {
          expect(body.message).toBe('La sucursal no existe.');
        });
    });

    it('responde 404 para una sucursal activa sin configuración, sin suponerla abierta', async () => {
      await client.query('DELETE FROM branch_configs WHERE branch_id=$1', [
        branchA,
      ]);
      try {
        const response = await request(app.getHttpServer())
          .get(`/api/v1/branches/${branchA}/config`)
          .expect(404);
        expect(response.body.message).toBe('La sucursal no existe.');
        expect(response.body).not.toEqual({ isOpen: true });
        expect(response.body).not.toHaveProperty('isOpen');
      } finally {
        await client.query(
          'INSERT INTO branch_configs (id,branch_id) VALUES ($1,$2) ON CONFLICT (branch_id) DO NOTHING',
          [randomUUID(), branchA],
        );
      }
    });

    it('responde 400 para un id que no es UUID', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/branches/id-invalido/config')
        .expect(400);
    });
  });

  // Fijan contra el driver real la forma de meta de la que depende el repositorio.
  describe('violaciones reales de FK en el repositorio', () => {
    it('la FK de updated_by no se traduce a sucursal inexistente', async () => {
      const before = await config(branchA);
      const error: unknown = await module
        .get(BranchConfigRepository, { strict: false })
        .setIsOpen(branchA, false, randomUUID())
        .catch((failure: unknown) => failure);
      expect(error).not.toBeInstanceOf(BranchNotFoundError);
      expect(error).toMatchObject({ code: 'P2003' });
      expect(await config(branchA)).toEqual(before);
    });

    it('la FK de sucursal se traduce a sucursal inexistente', async () => {
      // Simula una sucursal borrada entre la comprobación y el upsert.
      const prisma = module.get(PrismaService, { strict: false });
      const racingPrisma = {
        $transaction: <T>(work: (client: unknown) => Promise<T>) =>
          work({
            branch: { findFirst: () => Promise.resolve({ id: 'borrada' }) },
            branchConfig: prisma.branchConfig,
          }),
      } as unknown as PrismaService;
      await expect(
        new BranchConfigRepository(racingPrisma).setIsOpen(
          randomUUID(),
          false,
          userIds.get('manager') ?? '',
        ),
      ).rejects.toBeInstanceOf(BranchNotFoundError);
    });
  });

  it('una sucursal cerrada sigue mostrando su menú', async () => {
    await patch('manager', branchA, { isOpen: false }).expect(200);
    await request(app.getHttpServer())
      .get(`/api/v1/sucursales/${branchA}/menu`)
      .expect(200);
  });

  it('documenta ambos endpoints en Swagger', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().addBearerAuth().build(),
    );
    const path = document.paths['/api/v1/branches/{id}/config'];
    expect(Object.keys(path?.patch?.responses ?? {}).sort()).toEqual([
      '200',
      '400',
      '401',
      '403',
      '404',
    ]);
    expect(path?.patch?.security).toEqual([{ bearer: [] }]);
    expect(path?.patch?.summary).toBeTruthy();
    expect(path?.patch?.requestBody).toBeTruthy();
    expect(Object.keys(path?.get?.responses ?? {}).sort()).toEqual([
      '200',
      '400',
      '404',
    ]);
    expect(path?.get?.summary).toBeTruthy();
  });
});
