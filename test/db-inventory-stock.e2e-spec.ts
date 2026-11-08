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
import type { InventoryItemResponseDto } from '../src/inventory/stock/dto/index.js';

const PASSWORD = 'Prueba1234!';
const FORBIDDEN_BODY = {
  statusCode: 403,
  error: 'Forbidden',
  message: 'No tiene permiso para consultar este inventario.',
};

function summary(items: InventoryItemResponseDto[]) {
  return items.map(
    ({
      branchId,
      branchName,
      name,
      unit,
      currentStock,
      minimumStock,
      isLowStock,
    }) => ({
      branchId,
      branchName,
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
  const branchA = { id: randomUUID(), name: `BE05 A ${suffix}` };
  const branchB = { id: randomUUID(), name: `BE05 B ${suffix}` };
  const emptyBranch = { id: randomUUID(), name: `BE05 Vacía ${suffix}` };
  const inactiveBranch = { id: randomUUID(), name: `BE05 Inactiva ${suffix}` };

  function ingredient(label: string, unit: string, isActive = true) {
    return {
      id: randomUUID(),
      name: `BE05 ${label} ${suffix}`,
      unit,
      isActive,
    };
  }
  const broth = ingredient('Caldo', 'L');
  const noodles = ingredient('Fideos', 'kg');
  const chicken = ingredient('Pechuga', 'kg');
  const soy = ingredient('Soya', 'L');
  const hiddenInBranch = ingredient('Oculto en sucursal', 'kg');
  const hiddenInCatalog = ingredient('Oculto en catálogo', 'kg', false);

  // Cubren por debajo, igual y por encima del mínimo y stock cero, con valores
  // distintos entre sucursales para que el aislamiento se pueda comprobar.
  const stockA = [
    { item: broth, currentStock: 20, minimumStock: 8, isLowStock: false },
    { item: noodles, currentStock: 3, minimumStock: 5, isLowStock: true },
    { item: chicken, currentStock: 4, minimumStock: 4, isLowStock: true },
    { item: soy, currentStock: 0, minimumStock: 2, isLowStock: true },
  ];
  const stockB = [
    { item: broth, currentStock: 8, minimumStock: 8, isLowStock: true },
    { item: noodles, currentStock: 12, minimumStock: 5, isLowStock: false },
    { item: chicken, currentStock: 2.5, minimumStock: 4, isLowStock: true },
    { item: soy, currentStock: 6, minimumStock: 2, isLowStock: false },
  ];

  function expected(
    branch: { id: string; name: string },
    stock: typeof stockA,
  ) {
    return stock.map(({ item, currentStock, minimumStock, isLowStock }) => ({
      branchId: branch.id,
      branchName: branch.name,
      name: item.name,
      unit: item.unit,
      currentStock,
      minimumStock,
      isLowStock,
    }));
  }

  const actors = {
    managerA: { role: 'BRANCH_ADMIN', branchId: branchA.id },
    managerB: { role: 'BRANCH_ADMIN', branchId: branchB.id },
    emptyManager: { role: 'BRANCH_ADMIN', branchId: emptyBranch.id },
    inactiveManager: { role: 'BRANCH_ADMIN', branchId: inactiveBranch.id },
    generalManager: { role: 'GENERAL_MANAGER', branchId: null },
    client: { role: 'CLIENT', branchId: null },
    waiter: { role: 'WAITER', branchId: branchA.id },
    cook: { role: 'COOK', branchId: branchA.id },
    cashier: { role: 'CASHIER', branchId: branchA.id },
    inventoryManager: { role: 'INVENTORY_MANAGER', branchId: branchA.id },
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
    for (const [branch, isActive] of [
      [branchA, true],
      [branchB, true],
      [emptyBranch, true],
      [inactiveBranch, false],
    ] as const) {
      await client.query(
        'INSERT INTO branches (id,name,address,is_active) VALUES ($1,$2,$3,$4)',
        [branch.id, branch.name, 'Prueba', isActive],
      );
    }
    for (const { id, name, unit, isActive } of [
      broth,
      noodles,
      chicken,
      soy,
      hiddenInBranch,
      hiddenInCatalog,
    ]) {
      await client.query(
        'INSERT INTO ingredients (id,name,unit,is_active) VALUES ($1,$2,$3,$4)',
        [id, name, unit, isActive],
      );
    }
    for (const [
      branchId,
      ingredientId,
      currentStock,
      minimumStock,
      isActive,
    ] of [
      ...stockA.map(
        (row) =>
          [
            branchA.id,
            row.item.id,
            row.currentStock,
            row.minimumStock,
            true,
          ] as const,
      ),
      ...stockB.map(
        (row) =>
          [
            branchB.id,
            row.item.id,
            row.currentStock,
            row.minimumStock,
            true,
          ] as const,
      ),
      // Ninguna de estas tres filas debe aparecer en un listado.
      [branchA.id, hiddenInBranch.id, 1, 2, false] as const,
      [branchA.id, hiddenInCatalog.id, 1, 2, true] as const,
      [inactiveBranch.id, broth.id, 1, 2, true] as const,
    ]) {
      await client.query(
        `INSERT INTO branch_ingredients (id,branch_id,ingredient_id,current_stock,minimum_stock,is_active)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          randomUUID(),
          branchId,
          ingredientId,
          currentStock,
          minimumStock,
          isActive,
        ],
      );
    }

    const passwordHash = await hash(PASSWORD, 4);
    for (const [actor, { role, branchId }] of Object.entries(actors)) {
      const id = randomUUID();
      const email = `be05-${actor.toLowerCase()}-${suffix}@example.com`;
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

  afterAll(async () => {
    if (app) await app.close();
    else if (module) await module.close();
    if (client) {
      const branchIds = [branchA, branchB, emptyBranch, inactiveBranch].map(
        ({ id }) => id,
      );
      try {
        await client.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [
          [...userIds.values()],
        ]);
        await client.query(
          'DELETE FROM branch_ingredients WHERE branch_id=ANY($1::uuid[])',
          [branchIds],
        );
        await client.query('DELETE FROM ingredients WHERE id=ANY($1::uuid[])', [
          [broth, noodles, chicken, soy, hiddenInBranch, hiddenInCatalog].map(
            ({ id }) => id,
          ),
        ]);
        await client.query('DELETE FROM branches WHERE id=ANY($1::uuid[])', [
          branchIds,
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
    it('ve cantidad, mínimo y stock bajo solo de su sucursal', async () => {
      expect(summary(await items('managerA'))).toEqual(
        expected(branchA, stockA),
      );
    });

    it('otro gerente ve sus propios valores, sin datos de la primera sucursal', async () => {
      expect(summary(await items('managerB'))).toEqual(
        expected(branchB, stockB),
      );
    });

    it('devuelve el contrato completo con cantidades numéricas y updatedAt', async () => {
      const [item] = await items('managerA');
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
      const result = await items('managerA', `?branchId=${branchA.id}`);
      expect(summary(result)).toEqual(expected(branchA, stockA));
    });

    it('ignora una sucursal enviada en el cuerpo', async () => {
      const response = await get('managerA')
        .send({ branchId: branchB.id })
        .expect(200);
      expect(summary(response.body as InventoryItemResponseDto[])).toEqual(
        expected(branchA, stockA),
      );
    });

    it('toma la sucursal del usuario actual, no la del token emitido antes', async () => {
      const userId = userIds.get('managerA');
      await client.query('UPDATE users SET branch_id=$1 WHERE id=$2', [
        branchB.id,
        userId,
      ]);
      try {
        expect(summary(await items('managerA'))).toEqual(
          expected(branchB, stockB),
        );
      } finally {
        await client.query('UPDATE users SET branch_id=$1 WHERE id=$2', [
          branchA.id,
          userId,
        ]);
      }
    });
  });

  describe('aislamiento entre sucursales', () => {
    it.each([
      ['managerA', () => branchB.id],
      ['managerB', () => branchA.id],
    ] as const)(
      'rechaza a %s si solicita otra sucursal',
      async (actor, branchId) => {
        const response = await get(actor, `?branchId=${branchId()}`).expect(
          403,
        );
        expect(response.body).toEqual(FORBIDDEN_BODY);
      },
    );

    it('no revela si el branchId ajeno existe o tiene formato válido', async () => {
      for (const query of [
        `?branchId=${randomUUID()}`,
        '?branchId=no-es-uuid',
        '?branchId=',
      ]) {
        const response = await get('managerA', query).expect(403);
        expect(response.body).toEqual(FORBIDDEN_BODY);
      }
    });

    it('rechaza un branchId repetido aunque uno sea el propio', async () => {
      const response = await get(
        'managerA',
        `?branchId=${branchA.id}&branchId=${branchB.id}`,
      ).expect(403);
      expect(response.body).toEqual(FORBIDDEN_BODY);
    });
  });

  describe('gerente general', () => {
    it('sin query ve las sucursales activas con sus valores exactos y ninguna inactiva', async () => {
      const result = await items('generalManager');
      // La base es compartida con otras suites: solo se exigen las filas propias.
      const own = result.filter(({ branchId }) =>
        [branchA.id, branchB.id].some((id) => id === branchId),
      );
      expect(summary(own)).toEqual([
        ...expected(branchA, stockA),
        ...expected(branchB, stockB),
      ]);
      expect(result.map(({ branchId }) => branchId)).not.toContain(
        inactiveBranch.id,
      );
    });

    it.each([
      ['de una sucursal existente', () => branchA.id],
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
      const response = await get('waiter', `?branchId=${branchA.id}`).expect(
        403,
      );
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
