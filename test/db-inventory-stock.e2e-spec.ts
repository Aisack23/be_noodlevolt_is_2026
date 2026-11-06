import 'dotenv/config';
import { randomBytes, randomUUID } from 'node:crypto';
import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from 'bcrypt';
import { Client } from 'pg';
import request from 'supertest';
import { DEMO_PASSWORD, seedBaseData } from '../prisma/seeds/base-data.js';
import { seedInventoryData } from '../prisma/seeds/inventory-data.js';
import { PrismaClient } from '../src/generated/prisma/client.js';
import type { InventoryItemResponseDto } from '../src/inventory/stock/dto/index.js';

const FIXTURE_PASSWORD = 'Prueba1234!';
const FORBIDDEN_BODY = {
  statusCode: 403,
  error: 'Forbidden',
  message: 'No tiene permiso para consultar este inventario.',
};

function summary(items: InventoryItemResponseDto[]) {
  return items.map(
    ({ name, unit, currentStock, minimumStock, isLowStock }) => ({
      name,
      unit,
      currentStock,
      minimumStock,
      isLowStock,
    }),
  );
}

describe.sequential('BE-05: consulta de inventario contra PostgreSQL', () => {
  const suffix = randomUUID();
  const emptyBranch = randomUUID();
  const inactiveBranch = randomUUID();
  const stockedBranch = randomUUID();
  const activeIngredient = randomUUID();
  const inactiveIngredient = randomUUID();
  const seedAccounts = {
    santaTeclaManager: 'branch_admin@example.com',
    generalManager: 'general_manager@example.com',
    client: 'demo@example.com',
    waiter: 'waiter@example.com',
    cook: 'cook@example.com',
    cashier: 'cashier@example.com',
    inventoryManager: 'inventory_manager@example.com',
  };
  type Actor =
    | keyof typeof seedAccounts
    | 'centroManager'
    | 'emptyManager'
    | 'inactiveManager';
  const tokens = new Map<Actor, string>();
  const fixtureUsers = new Map<Actor, string>();
  let centro: string;
  let santaTecla: string;
  let app: INestApplication;
  let module: TestingModule;
  let client: Client;

  async function login(actor: Actor, email: string, password: string) {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password });
    const { accessToken } = response.body as { accessToken: string };
    tokens.set(actor, accessToken);
  }

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

    const prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    });
    try {
      await seedBaseData(prisma);
      await seedInventoryData(prisma);
    } finally {
      await prisma.$disconnect();
    }

    client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    const seeded = await client.query<{ id: string; name: string }>(
      'SELECT id,name FROM branches WHERE name=ANY($1::varchar[])',
      [['NoodleVolt Centro', 'NoodleVolt Santa Tecla']],
    );
    const branchId = (name: string) =>
      seeded.rows.find((branch) => branch.name === name)?.id ?? '';
    centro = branchId('NoodleVolt Centro');
    santaTecla = branchId('NoodleVolt Santa Tecla');

    for (const [name, id, isActive] of [
      ['Vacía', emptyBranch, true],
      ['Inactiva', inactiveBranch, false],
      ['Con existencias', stockedBranch, true],
    ] as const) {
      await client.query(
        'INSERT INTO branches (id,name,address,is_active) VALUES ($1,$2,$3,$4)',
        [id, `BE05 ${name} ${suffix}`, 'Prueba', isActive],
      );
    }
    for (const [name, id, isActive] of [
      ['Activo', activeIngredient, true],
      ['Inactivo', inactiveIngredient, false],
    ] as const) {
      await client.query(
        'INSERT INTO ingredients (id,name,unit,is_active) VALUES ($1,$2,$3,$4)',
        [id, `BE05 ${name} ${suffix}`, 'kg', isActive],
      );
    }
    for (const [branch, ingredient, isActive] of [
      [stockedBranch, activeIngredient, true],
      [inactiveBranch, activeIngredient, true],
      // Sobre Centro: ninguna de estas dos filas debe aparecer en el listado.
      [centro, activeIngredient, false],
      [centro, inactiveIngredient, true],
    ] as const) {
      await client.query(
        `INSERT INTO branch_ingredients (id,branch_id,ingredient_id,current_stock,minimum_stock,is_active)
         VALUES ($1,$2,$3,1,2,$4)`,
        [randomUUID(), branch, ingredient, isActive],
      );
    }

    const passwordHash = await hash(FIXTURE_PASSWORD, 4);
    for (const [actor, branch] of [
      ['centroManager', centro],
      ['emptyManager', emptyBranch],
      ['inactiveManager', inactiveBranch],
    ] as const) {
      const id = randomUUID();
      const email = `be05-${actor.toLowerCase()}-${suffix}@example.com`;
      await client.query(
        `INSERT INTO users (id,name,email,password_hash,role,branch_id,updated_at)
         VALUES ($1,$2,$3,$4,'BRANCH_ADMIN',$5,now())`,
        [id, actor, email, passwordHash, branch],
      );
      fixtureUsers.set(actor, id);
      await login(actor, email, FIXTURE_PASSWORD);
    }
    for (const [actor, email] of Object.entries(seedAccounts)) {
      await login(actor as Actor, email, DEMO_PASSWORD);
    }
  }, 60_000);

  afterAll(async () => {
    if (app) await app.close();
    else if (module) await module.close();
    if (client) {
      try {
        await client.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [
          [...fixtureUsers.values()],
        ]);
        await client.query(
          'DELETE FROM branch_ingredients WHERE ingredient_id=ANY($1::uuid[])',
          [[activeIngredient, inactiveIngredient]],
        );
        await client.query('DELETE FROM ingredients WHERE id=ANY($1::uuid[])', [
          [activeIngredient, inactiveIngredient],
        ]);
        await client.query('DELETE FROM branches WHERE id=ANY($1::uuid[])', [
          [emptyBranch, inactiveBranch, stockedBranch],
        ]);
      } finally {
        await client.end();
      }
    }
  });

  function get(actor: Actor | null, query = '') {
    const call = request(app.getHttpServer()).get(`/api/v1/inventory${query}`);
    return actor
      ? call.auth(tokens.get(actor) ?? '', { type: 'bearer' })
      : call;
  }

  async function items(actor: Actor, query = '') {
    const response = await get(actor, query).expect(200);
    return response.body as InventoryItemResponseDto[];
  }

  describe('gerente de sucursal', () => {
    it('ve en Centro cantidad, mínimo y stock bajo de su sucursal', async () => {
      const result = await items('centroManager');
      expect(summary(result)).toEqual([
        {
          name: 'Caldo base',
          unit: 'L',
          currentStock: 20,
          minimumStock: 8,
          isLowStock: false,
        },
        {
          name: 'Fideos de ramen',
          unit: 'kg',
          currentStock: 3,
          minimumStock: 5,
          isLowStock: true,
        },
        {
          name: 'Pechuga de pollo',
          unit: 'kg',
          currentStock: 4,
          minimumStock: 4,
          isLowStock: true,
        },
        {
          name: 'Salsa de soya',
          unit: 'L',
          currentStock: 0,
          minimumStock: 2,
          isLowStock: true,
        },
      ]);
      expect(new Set(result.map((item) => item.branchId))).toEqual(
        new Set([centro]),
      );
    });

    it('ve en Santa Tecla sus propios valores, sin datos de Centro', async () => {
      const result = await items('santaTeclaManager');
      expect(summary(result)).toEqual([
        {
          name: 'Caldo base',
          unit: 'L',
          currentStock: 8,
          minimumStock: 8,
          isLowStock: true,
        },
        {
          name: 'Fideos de ramen',
          unit: 'kg',
          currentStock: 12,
          minimumStock: 5,
          isLowStock: false,
        },
        {
          name: 'Pechuga de pollo',
          unit: 'kg',
          currentStock: 2.5,
          minimumStock: 4,
          isLowStock: true,
        },
        {
          name: 'Salsa de soya',
          unit: 'L',
          currentStock: 6,
          minimumStock: 2,
          isLowStock: false,
        },
      ]);
      expect(new Set(result.map((item) => item.branchId))).toEqual(
        new Set([santaTecla]),
      );
    });

    it('devuelve el contrato completo con cantidades numéricas y updatedAt', async () => {
      const [item] = await items('centroManager');
      expect(Object.keys(item).sort()).toEqual([
        'branchId',
        'branchName',
        'currentStock',
        'id',
        'isLowStock',
        'minimumStock',
        'name',
        'unit',
        'updatedAt',
      ]);
      expect(item.branchName).toBe('NoodleVolt Centro');
      expect(typeof item.currentStock).toBe('number');
      expect(typeof item.minimumStock).toBe('number');
      const stored = await client.query<{ updated_at: Date }>(
        'SELECT updated_at FROM branch_ingredients WHERE id=$1',
        [item.id],
      );
      expect(item.updatedAt).toBe(stored.rows[0].updated_at.toISOString());
    });

    it('responde una lista vacía si su sucursal no tiene insumos', async () => {
      expect(await items('emptyManager')).toEqual([]);
    });

    it('responde 404 si su sucursal está inactiva, sin exponer existencias', async () => {
      const response = await get('inactiveManager').expect(404);
      expect(response.body).toEqual({
        statusCode: 404,
        error: 'Not Found',
        message: 'La sucursal no existe.',
      });
    });

    it('acepta un branchId igual a su propia sucursal', async () => {
      const result = await items('centroManager', `?branchId=${centro}`);
      expect(result).toEqual(await items('centroManager'));
    });

    it('ignora una sucursal enviada en el cuerpo', async () => {
      const response = await get('centroManager')
        .send({ branchId: santaTecla })
        .expect(200);
      const result = response.body as InventoryItemResponseDto[];
      expect(new Set(result.map((item) => item.branchId))).toEqual(
        new Set([centro]),
      );
    });

    it('toma la sucursal del usuario actual, no la del token emitido antes', async () => {
      const userId = fixtureUsers.get('centroManager');
      await client.query('UPDATE users SET branch_id=$1 WHERE id=$2', [
        santaTecla,
        userId,
      ]);
      try {
        const result = await items('centroManager');
        expect(new Set(result.map((item) => item.branchId))).toEqual(
          new Set([santaTecla]),
        );
      } finally {
        await client.query('UPDATE users SET branch_id=$1 WHERE id=$2', [
          centro,
          userId,
        ]);
      }
    });
  });

  describe('aislamiento entre sucursales', () => {
    it('rechaza al gerente de Santa Tecla que solicita Centro', async () => {
      const response = await get(
        'santaTeclaManager',
        `?branchId=${centro}`,
      ).expect(403);
      expect(response.body).toEqual(FORBIDDEN_BODY);
    });

    it('rechaza al gerente de Centro que solicita Santa Tecla', async () => {
      const response = await get(
        'centroManager',
        `?branchId=${santaTecla}`,
      ).expect(403);
      expect(response.body).toEqual(FORBIDDEN_BODY);
    });

    it('no revela si el branchId ajeno existe o tiene formato válido', async () => {
      for (const query of [
        `?branchId=${randomUUID()}`,
        '?branchId=no-es-uuid',
        '?branchId=',
      ]) {
        const response = await get('centroManager', query).expect(403);
        expect(response.body).toEqual(FORBIDDEN_BODY);
      }
    });

    it('rechaza un branchId repetido aunque uno sea el propio', async () => {
      const response = await get(
        'centroManager',
        `?branchId=${centro}&branchId=${santaTecla}`,
      ).expect(403);
      expect(response.body).toEqual(FORBIDDEN_BODY);
    });
  });

  describe('gerente general', () => {
    it('sin query ve todas las sucursales activas y ninguna inactiva', async () => {
      const result = await items('generalManager');
      const expected = await client.query<{ id: string }>(
        `SELECT bi.id FROM branch_ingredients bi
         JOIN branches b ON b.id=bi.branch_id
         JOIN ingredients i ON i.id=bi.ingredient_id
         WHERE b.is_active AND bi.is_active AND i.is_active
         ORDER BY b.name,i.name,bi.id`,
      );
      expect(result.map((item) => item.id)).toEqual(
        expected.rows.map((row) => row.id),
      );
      const branches = new Set(result.map((item) => item.branchId));
      expect(branches).toContain(centro);
      expect(branches).toContain(santaTecla);
      expect(branches).toContain(stockedBranch);
      expect(branches).not.toContain(inactiveBranch);
    });

    it.each([
      ['de una sucursal existente', () => centro],
      ['inexistente', () => randomUUID()],
      ['con formato inválido', () => 'no-es-uuid'],
      ['vacío', () => ''],
    ])('recibe 403 si envía un branchId %s', async (_case, branchId) => {
      const response = await get(
        'generalManager',
        `?branchId=${branchId()}`,
      ).expect(403);
      expect(response.body).toEqual(FORBIDDEN_BODY);
    });
  });

  describe('autorización', () => {
    it('responde 401 sin token, sin exponer existencias', async () => {
      const response = await get(null).expect(401);
      expect(response.body).toEqual({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Falta el token de acceso.',
      });
    });

    it('responde 401 con un token inválido', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/inventory')
        .auth('token-invalido', { type: 'bearer' })
        .expect(401);
    });

    it.each<Actor>(['client', 'waiter', 'cook', 'cashier', 'inventoryManager'])(
      'responde 403 al rol %s',
      async (actor) => {
        const response = await get(actor).expect(403);
        expect(response.body).toEqual(FORBIDDEN_BODY);
      },
    );

    it('rechaza a un rol sin permiso aunque envíe su propia sucursal', async () => {
      const response = await get('waiter', `?branchId=${centro}`).expect(403);
      expect(response.body).toEqual(FORBIDDEN_BODY);
    });
  });

  it('documenta el endpoint y sus errores en Swagger', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().addBearerAuth().build(),
    );
    const operation = document.paths['/api/v1/inventory']?.get;
    expect(Object.keys(operation?.responses ?? {}).sort()).toEqual([
      '200',
      '401',
      '403',
      '404',
    ]);
    expect(operation?.security).toEqual([{ bearer: [] }]);
    expect(operation?.summary).toBeTruthy();
    const schema = document.components?.schemas?.InventoryItemResponseDto;
    expect(schema).toMatchObject({
      properties: {
        currentStock: { type: 'number' },
        minimumStock: { type: 'number' },
        isLowStock: { type: 'boolean' },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    });
  });
});
