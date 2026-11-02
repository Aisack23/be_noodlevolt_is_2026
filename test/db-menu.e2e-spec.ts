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
  const categories = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  const categoryOrders = [3, 2, 4, 1];
  const suffix = randomUUID();
  const categoryNames = [
    `A Bebidas ${suffix}`,
    `B Platos fuertes ${suffix}`,
    `C Ocultos ${suffix}`,
    `D Vacía ${suffix}`,
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
          'INSERT INTO categories (id,name,display_order) VALUES ($1,$2,$3)',
          [id, categoryNames[index], categoryOrders[index]],
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
          category: 1,
          name: 'Ramen',
          price: '13.00',
          status: 'AVAILABLE',
        },
        {
          branch: 1,
          category: 0,
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
  });
});
