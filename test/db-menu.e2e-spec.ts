import 'dotenv/config';
import { randomBytes, randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Client } from 'pg';
import request from 'supertest';
import type { MenuResponseDto } from '../src/catalog/menu/dto/index.js';
import { INGREDIENT_AVAILABILITY_CHECKER } from '../src/catalog/menu/ports/index.js';
import type { IngredientAvailabilityChecker } from '../src/catalog/menu/ports/index.js';

describe.sequential('BE-1.2.1: menú público contra PostgreSQL', () => {
  const branches = [randomUUID(), randomUUID(), randomUUID()];
  const categories = [
    randomUUID(),
    randomUUID(),
    randomUUID(),
    randomUUID(),
    randomUUID(),
    randomUUID(),
  ];
  const categoryOrders = [3, 2, 4, 1, 3, 2];
  // Las dos últimas son las copias de Bebidas y Platos fuertes en la segunda sucursal.
  const categoryBranches = [0, 0, 0, 0, 1, 1];
  const suffix = randomUUID();
  const categoryNames = [
    `A Bebidas ${suffix}`,
    `B Platos fuertes ${suffix}`,
    `C Ocultos ${suffix}`,
    `D Vacía ${suffix}`,
    `A Bebidas ${suffix}`,
    `B Platos fuertes ${suffix}`,
  ];
  let app: INestApplication;
  let module: TestingModule;
  let client: Client;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL)
      throw new Error(
        'Configurar DATABASE_URL y aplicar las migraciones en PostgreSQL de Docker.',
      );
    // AppModule valida la configuración al importarse; la clave de tests no se persiste.
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
    // El servidor usa otra conexión: los fixtures deben estar confirmados para ser visibles.
    await client.query('BEGIN');
    try {
      for (const [index, id] of branches.entries()) {
        await client.query(
          'INSERT INTO branches (id,name,address) VALUES ($1,$2,$3)',
          [id, `Menu ${index} ${suffix}`, 'Prueba'],
        );
      }
      for (const [index, id] of categories.entries()) {
        await client.query(
          'INSERT INTO categories (id,branch_id,name,display_order) VALUES ($1,$2,$3,$4)',
          [
            id,
            branches[categoryBranches[index]],
            categoryNames[index],
            categoryOrders[index],
          ],
        );
      }
      const dishes = [
        {
          branch: 0,
          category: 0,
          name: 'Zumo',
          price: '2.50',
          status: 'AVAILABLE',
        },
        {
          branch: 0,
          category: 0,
          name: 'Agua',
          price: '1.25',
          status: 'AVAILABLE',
        },
        {
          branch: 0,
          category: 1,
          name: 'Ramen',
          price: '8.50',
          status: 'AVAILABLE',
        },
        {
          branch: 0,
          category: 1,
          name: 'Gyozas',
          price: '5.00',
          status: 'SOLD_OUT',
        },
        {
          branch: 0,
          category: 2,
          name: 'Oculto',
          price: '9.00',
          status: 'DISABLED',
        },
        {
          branch: 1,
          category: 5,
          name: 'Ramen',
          price: '13.00',
          status: 'AVAILABLE',
        },
        {
          branch: 1,
          category: 4,
          name: 'Zumo',
          price: '4.75',
          status: 'AVAILABLE',
        },
      ];
      for (const dish of dishes) {
        await client.query(
          'INSERT INTO dishes (id,branch_id,category_id,name,price,status) VALUES ($1,$2,$3,$4,$5,$6)',
          [
            randomUUID(),
            branches[dish.branch],
            categories[dish.category],
            dish.name,
            dish.price,
            dish.status,
          ],
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    if (app) await app.close();
    else if (module) await module.close();
    if (client) {
      try {
        await client.query('BEGIN');
        await client.query(
          'DELETE FROM dishes WHERE branch_id=ANY($1::uuid[])',
          [branches],
        );
        await client.query('DELETE FROM categories WHERE id=ANY($1::uuid[])', [
          categories,
        ]);
        await client.query('DELETE FROM branches WHERE id=ANY($1::uuid[])', [
          branches,
        ]);
        await client.query('COMMIT');
      } finally {
        await client.end();
      }
    }
  });

  async function menu(branchId = branches[0]): Promise<MenuResponseDto> {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/sucursales/${branchId}/menu`)
      .expect(200);
    return response.body as MenuResponseDto;
  }

  it('BE-01: consulta pública en inglés con precios y aislamiento por sucursal', async () => {
    const first = await request(app.getHttpServer())
      .get('/api/v1/dishes')
      .query({ branchId: branches[0], status: 'active' })
      .expect(200);
    const second = await request(app.getHttpServer())
      .get('/api/v1/dishes')
      .query({ branchId: branches[1] })
      .expect(200);
    expect(
      first.body.find((dish: { name: string }) => dish.name === 'Ramen'),
    ).toMatchObject({
      branchId: branches[0],
      price: '8.50',
      isAvailable: true,
    });
    expect(
      second.body.find((dish: { name: string }) => dish.name === 'Ramen'),
    ).toMatchObject({ branchId: branches[1], price: '13.00' });
    expect(first.body.map((dish: { name: string }) => dish.name)).not.toEqual(
      expect.arrayContaining(['Gyozas', 'Oculto']),
    );
  });

  it('BE-01: excluye eliminados y no disponibles al releer PostgreSQL', async () => {
    await client.query(
      "UPDATE dishes SET is_deleted=(name='Ramen'), is_available=(name<>'Agua') WHERE branch_id=$1",
      [branches[0]],
    );
    try {
      const response = await request(app.getHttpServer())
        .get('/api/v1/dishes')
        .query({ branchId: branches[0] })
        .expect(200);
      expect(
        response.body.map((dish: { name: string }) => dish.name),
      ).not.toEqual(expect.arrayContaining(['Ramen', 'Agua']));
    } finally {
      await client.query(
        'UPDATE dishes SET is_deleted=false, is_available=true WHERE branch_id=$1',
        [branches[0]],
      );
    }
  });

  it('BE-01: diferencia menú vacío, sucursal inexistente y entrada inválida', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/dishes')
      .query({ branchId: branches[2] })
      .expect(200, []);
    await request(app.getHttpServer())
      .get('/api/v1/dishes')
      .query({ branchId: randomUUID() })
      .expect(404);
    await request(app.getHttpServer()).get('/api/v1/dishes').expect(400);
    await request(app.getHttpServer())
      .get('/api/v1/dishes')
      .query({ branchId: branches[0], status: 'inactive' })
      .expect(400);
  });

  it('responde sin token con sucursal y claves JSON en español', async () => {
    const body = await menu();
    expect(body.sucursal).toEqual({
      id: branches[0],
      nombre: `Menu 0 ${suffix}`,
    });
    expect(Object.keys(body).sort()).toEqual(['categorias', 'sucursal']);
    expect(
      body.categorias
        .flatMap((category) => category.platillos)
        .find((dish) => dish.nombre === 'Agua'),
    ).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        nombre: 'Agua',
        descripcion: null,
        precio: '1.25',
        disponible: true,
      }),
    );
  });
  it('devuelve 404 para una sucursal inexistente', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/sucursales/${randomUUID()}/menu`)
      .expect(404)
      .expect(({ body }) => {
        expect(body.message).toBe('La sucursal no existe.');
      });
  });
  it('devuelve 404 para una sucursal inactiva', async () => {
    await client.query('UPDATE branches SET is_active=false WHERE id=$1', [
      branches[0],
    ]);
    try {
      await request(app.getHttpServer())
        .get(`/api/v1/sucursales/${branches[0]}/menu`)
        .expect(404)
        .expect(({ body }) => {
          expect(body.message).toBe('La sucursal no existe.');
        });
    } finally {
      await client.query('UPDATE branches SET is_active=true WHERE id=$1', [
        branches[0],
      ]);
    }
  });
  it.each(['id-invalido', '123'])('devuelve 400 para el id %s', async (id) => {
    await request(app.getHttpServer())
      .get(`/api/v1/sucursales/${id}/menu`)
      .expect(400)
      .expect(({ body }) => {
        expect(body.message).toBe('El identificador de sucursal no es válido.');
      });
  });
  it('omite deshabilitados y categorías sin platillos visibles', async () => {
    const body = await menu();
    expect(body.categorias.map((category) => category.nombre)).toEqual([
      categoryNames[1],
      categoryNames[0],
    ]);
    expect(
      body.categorias
        .flatMap((category) => category.platillos)
        .map((dish) => dish.nombre),
    ).not.toContain('Oculto');
  });
  it('omite platillos de categorías inactivas', async () => {
    await client.query('UPDATE categories SET is_active=false WHERE id=$1', [
      categories[0],
    ]);
    try {
      const body = await menu();
      expect(body.categorias.map((category) => category.nombre)).toEqual([
        categoryNames[1],
      ]);
      expect(
        body.categorias
          .flatMap((category) => category.platillos)
          .map((dish) => dish.nombre),
      ).toEqual(['Gyozas', 'Ramen']);
    } finally {
      await client.query('UPDATE categories SET is_active=true WHERE id=$1', [
        categories[0],
      ]);
    }
  });
  it('incluye agotados con disponible falso', async () => {
    const body = await menu();
    expect(
      body.categorias
        .flatMap((category) => category.platillos)
        .find((dish) => dish.nombre === 'Gyozas'),
    ).toEqual(expect.objectContaining({ precio: '5.00', disponible: false }));
  });
  it('devuelve los precios propios de cada sucursal', async () => {
    const first = (await menu()).categorias.flatMap(
      (category) => category.platillos,
    );
    const second = (await menu(branches[1])).categorias.flatMap(
      (category) => category.platillos,
    );
    expect(first.find((dish) => dish.nombre === 'Ramen')?.precio).toBe('8.50');
    expect(second.find((dish) => dish.nombre === 'Ramen')?.precio).toBe(
      '13.00',
    );
    expect(first.find((dish) => dish.nombre === 'Zumo')?.precio).toBe('2.50');
    expect(second.find((dish) => dish.nombre === 'Zumo')?.precio).toBe('4.75');
    expect(second.map((dish) => dish.nombre)).not.toContain('Gyozas');
  });
  it('prioriza display_order de categorías y ordena platillos por nombre', async () => {
    const body = await menu();
    expect(body.categorias.map((category) => category.nombre)).toEqual([
      categoryNames[1],
      categoryNames[0],
    ]);
    expect(
      body.categorias.map((category) =>
        category.platillos.map((dish) => dish.nombre),
      ),
    ).toEqual([
      ['Gyozas', 'Ramen'],
      ['Agua', 'Zumo'],
    ]);
  });
  it('desempata categorías de igual display_order por nombre', async () => {
    try {
      await client.query('UPDATE categories SET display_order=2 WHERE id=$1', [
        categories[0],
      ]);
      expect(
        (await menu()).categorias.map((category) => category.nombre),
      ).toEqual(categoryNames.slice(0, 2));
    } finally {
      await client.query('UPDATE categories SET display_order=$1 WHERE id=$2', [
        categoryOrders[0],
        categories[0],
      ]);
    }
  });
  it('distingue una sucursal vacía de una inexistente', async () => {
    expect((await menu(branches[2])).categorias).toEqual([]);
  });
  it('respeta el resultado del provider intercambiable de insumos', async () => {
    const checker = app.get<IngredientAvailabilityChecker>(
      INGREDIENT_AVAILABILITY_CHECKER,
    );
    const spy = vi
      .spyOn(checker, 'findSufficientDishIds')
      .mockResolvedValueOnce(new Set());
    try {
      const dishes = (await menu()).categorias.flatMap(
        (category) => category.platillos,
      );
      expect(dishes.every((dish) => !dish.disponible)).toBe(true);
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });
  it('refleja cambios de precio y estado en la siguiente consulta', async () => {
    try {
      await client.query(
        "UPDATE dishes SET price=8.75,status='SOLD_OUT' WHERE branch_id=$1 AND name='Ramen'",
        [branches[0]],
      );
      const dishes = (await menu()).categorias.flatMap(
        (category) => category.platillos,
      );
      expect(dishes.find((dish) => dish.nombre === 'Ramen')).toEqual(
        expect.objectContaining({ precio: '8.75', disponible: false }),
      );
    } finally {
      await client.query(
        "UPDATE dishes SET price=8.50,status='AVAILABLE' WHERE branch_id=$1 AND name='Ramen'",
        [branches[0]],
      );
    }
  });
  it('documenta la ruta pública, ejemplo y errores en Swagger', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Test').setVersion('1').build(),
    );
    const operation =
      document.paths['/api/v1/sucursales/{sucursalId}/menu'].get;
    expect(operation).toBeDefined();
    expect(operation?.security ?? []).toEqual([]);
    expect(operation?.responses).toHaveProperty('400');
    expect(JSON.stringify(operation?.responses['400'])).toContain(
      'El identificador de sucursal no es válido.',
    );
    expect(operation?.responses).toHaveProperty('404');
    expect(JSON.stringify(operation?.responses['200'])).toContain('8.50');
    expect(operation?.description).toContain(
      'Si falla la verificación de insumos',
    );
  });

  it('QA-01: permite consultar el menú con un Bearer inválido porque la ruta es pública', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/sucursales/${branches[0]}/menu`)
      .set('Authorization', 'Bearer token-invalido')
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        sucursal: expect.objectContaining({
          id: branches[0],
        }),
        categorias: expect.any(Array),
      }),
    );
  });

  it('QA-01: responde con disponibilidad falsa si falla el verificador de insumos', async () => {
    const checker = app.get<IngredientAvailabilityChecker>(
      INGREDIENT_AVAILABILITY_CHECKER,
    );

    const spy = vi
      .spyOn(checker, 'findSufficientDishIds')
      .mockRejectedValueOnce(new Error('Fallo simulado del verificador'));

    try {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/sucursales/${branches[0]}/menu`)
        .expect(200);

      const body = response.body as MenuResponseDto;

      const dishes = body.categorias.flatMap((category) => category.platillos);

      expect(dishes.length).toBeGreaterThan(0);

      expect(dishes.every((dish) => dish.disponible === false)).toBe(true);

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith(branches[0], expect.any(Array));
    } finally {
      spy.mockRestore();
    }
  });
});
