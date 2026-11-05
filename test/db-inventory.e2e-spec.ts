import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { Client } from 'pg';
import { BASE_BRANCHES, seedBaseData } from '../prisma/seeds/base-data.js';
import { seedInventoryData } from '../prisma/seeds/inventory-data.js';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { databaseFixture } from './support/database.js';

describe.sequential('DB-05: inventario de insumos', () => {
  const db = databaseFixture();

  async function createIngredient(name: string = randomUUID()) {
    const id = randomUUID();
    await db.client.query(
      'INSERT INTO ingredients (id,name,unit) VALUES ($1,$2,$3)',
      [id, name, 'kg'],
    );
    return id;
  }
  function createStock(
    ingredientId: string,
    currentStock: string | number | null = 1,
    minimumStock: string | number | null = 1,
    branchId = db.branches[0],
  ) {
    return db.client.query<{ id: string }>(
      `INSERT INTO branch_ingredients (id,branch_id,ingredient_id,current_stock,minimum_stock)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [randomUUID(), branchId, ingredientId, currentStock, minimumStock],
    );
  }

  it('crea existencias en cero con fechas de auditoría por defecto', async () => {
    const ingredientId = await createIngredient();
    const { rows } = await db.client.query<{
      current_stock: string;
      minimum_stock: string;
      created_at: Date;
      updated_at: Date;
    }>(
      `INSERT INTO branch_ingredients (id,branch_id,ingredient_id) VALUES ($1,$2,$3)
         RETURNING current_stock,minimum_stock,created_at,updated_at`,
      [randomUUID(), db.branches[0], ingredientId],
    );
    expect(rows[0].current_stock).toBe('0.000');
    expect(rows[0].minimum_stock).toBe('0.000');
    expect(rows[0].created_at).toBeInstanceOf(Date);
    expect(rows[0].updated_at).toBeInstanceOf(Date);
  });
  it('guarda las fechas de auditoría con zona horaria', async () => {
    const { rows } = await db.client.query<{ data_type: string }>(
      `SELECT data_type FROM information_schema.columns
         WHERE table_schema='public' AND table_name='branch_ingredients'
           AND column_name IN ('created_at','updated_at')`,
    );
    expect(rows).toEqual([
      { data_type: 'timestamp with time zone' },
      { data_type: 'timestamp with time zone' },
    ]);
  });
  it('conserva cantidades con tres decimales', async () => {
    const { rows } = await createStock(
      await createIngredient(),
      '2.125',
      '0.5',
    );
    const stored = await db.client.query<{
      current_stock: string;
      minimum_stock: string;
    }>(
      'SELECT current_stock,minimum_stock FROM branch_ingredients WHERE id=$1',
      [rows[0].id],
    );
    expect(stored.rows[0]).toEqual({
      current_stock: '2.125',
      minimum_stock: '0.500',
    });
  });
  it.each([
    ['negativo', '-0.001'],
    ['NaN', 'NaN'],
  ])('rechaza stock actual %s', async (_case, value) => {
    const ingredientId = await createIngredient();
    await db.rejectWrite(
      () => createStock(ingredientId, value),
      '23514',
      'branch_ingredients_current_stock_check',
    );
  });
  it.each([
    ['negativo', '-0.001'],
    ['NaN', 'NaN'],
  ])('rechaza stock mínimo %s', async (_case, value) => {
    const ingredientId = await createIngredient();
    await db.rejectWrite(
      () => createStock(ingredientId, 1, value),
      '23514',
      'branch_ingredients_minimum_stock_check',
    );
  });
  it('impide que una actualización deje el stock negativo', async () => {
    const { rows } = await createStock(await createIngredient(), 1, 0);
    await db.rejectWrite(
      () =>
        db.client.query(
          'UPDATE branch_ingredients SET current_stock = current_stock - 2 WHERE id=$1',
          [rows[0].id],
        ),
      '23514',
      'branch_ingredients_current_stock_check',
    );
  });
  it('acepta stock actual y mínimo iguales a cero', async () => {
    const { rows } = await createStock(await createIngredient(), 0, 0);
    expect(rows).toHaveLength(1);
  });
  it('rechaza cantidades nulas', async () => {
    const ingredientId = await createIngredient();
    await db.rejectWrite(() => createStock(ingredientId, null), '23502');
    await db.rejectWrite(() => createStock(ingredientId, 1, null), '23502');
  });
  it('registra un insumo una sola vez por sucursal, con existencias independientes', async () => {
    const ingredientId = await createIngredient();
    await createStock(ingredientId, 3, 5);
    await db.rejectWrite(
      () => createStock(ingredientId),
      '23505',
      'branch_ingredients_branch_id_ingredient_id_key',
    );
    await createStock(ingredientId, 12, 5, db.branches[1]);
    const { rows } = await db.client.query<{
      branch_id: string;
      current_stock: string;
    }>(
      'SELECT branch_id,current_stock FROM branch_ingredients WHERE ingredient_id=$1',
      [ingredientId],
    );
    expect(rows).toEqual(
      expect.arrayContaining([
        { branch_id: db.branches[0], current_stock: '3.000' },
        { branch_id: db.branches[1], current_stock: '12.000' },
      ]),
    );
  });
  it('rechaza dos insumos con el mismo nombre', async () => {
    const name = randomUUID();
    await createIngredient(name);
    await db.rejectWrite(
      () => createIngredient(name),
      '23505',
      'ingredients_name_key',
    );
  });
  it('exige sucursal e insumo existentes', async () => {
    const ingredientId = await createIngredient();
    await db.rejectWrite(
      () => createStock(ingredientId, 1, 1, randomUUID()),
      '23503',
      'branch_ingredients_branch_id_fkey',
    );
    await db.rejectWrite(
      () => createStock(randomUUID()),
      '23503',
      'branch_ingredients_ingredient_id_fkey',
    );
  });
  it('impide borrar una sucursal con existencias y las conserva', async () => {
    const { rows } = await createStock(await createIngredient());
    await db.rejectWrite(
      () =>
        db.client.query('DELETE FROM branches WHERE id=$1', [db.branches[0]]),
      '23001',
      'branch_ingredients_branch_id_fkey',
    );
    const stored = await db.client.query(
      'SELECT id FROM branch_ingredients WHERE id=$1',
      [rows[0].id],
    );
    expect(stored.rows).toHaveLength(1);
  });
  it('impide borrar un insumo con existencias', async () => {
    const ingredientId = await createIngredient();
    await createStock(ingredientId);
    await db.rejectWrite(
      () =>
        db.client.query('DELETE FROM ingredients WHERE id=$1', [ingredientId]),
      '23001',
      'branch_ingredients_ingredient_id_fkey',
    );
  });
  it('indexa las existencias por sucursal', async () => {
    const { rows } = await db.client.query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes
         WHERE tablename='branch_ingredients'
           AND indexname='branch_ingredients_branch_id_current_stock_idx'`,
    );
    expect(rows[0].indexdef).toContain('(branch_id, current_stock)');
  });
});

// El seed confirma sus escrituras con su propia conexión, por lo que no puede
// correr dentro de la transacción con rollback de databaseFixture.
describe.sequential('DB-05: seed de insumos', () => {
  const SEED_TIMEOUT_MS = 30_000;
  const branchNames = BASE_BRANCHES.map(({ name }) => name);
  let client: Client;
  let prisma: PrismaClient;

  interface StockRow {
    id: string;
    branch: string;
    ingredient: string;
    unit: string;
    current_stock: string;
    minimum_stock: string;
    created_at: Date;
    updated_at: Date;
  }

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    });
    await seedBaseData(prisma);
    await seedInventoryData(prisma);
  }, SEED_TIMEOUT_MS);

  afterAll(async () => {
    await prisma.$disconnect();
    await client.end();
  });

  async function stockSnapshot() {
    const { rows } = await client.query<StockRow>(
      `SELECT s.id, b.name AS branch, i.name AS ingredient, i.unit,
              s.current_stock, s.minimum_stock, s.created_at, s.updated_at
         FROM branch_ingredients s
         JOIN branches b ON b.id = s.branch_id
         JOIN ingredients i ON i.id = s.ingredient_id
         WHERE b.name = ANY($1) ORDER BY b.name, i.name`,
      [branchNames],
    );
    return rows;
  }
  function find(rows: StockRow[], branch: string, ingredient: string) {
    const row = rows.find(
      (candidate) =>
        candidate.branch === branch && candidate.ingredient === ingredient,
    );
    if (!row) throw new Error(`Falta ${ingredient} en ${branch}.`);
    return row;
  }
  async function withRestoredStock(test: () => Promise<void>) {
    const original = await stockSnapshot();
    try {
      await test();
    } finally {
      for (const row of original)
        await client.query(
          'UPDATE branch_ingredients SET current_stock=$1, minimum_stock=$2, updated_at=$3 WHERE id=$4',
          [row.current_stock, row.minimum_stock, row.updated_at, row.id],
        );
    }
  }

  it('prepara casos por debajo, igual y por encima del mínimo en cada sucursal', async () => {
    const { rows } = await client.query<{
      branch: string;
      below: number;
      equal: number;
      above: number;
    }>(
      `SELECT b.name AS branch,
              count(*) FILTER (WHERE s.current_stock < s.minimum_stock)::int AS below,
              count(*) FILTER (WHERE s.current_stock = s.minimum_stock)::int AS equal,
              count(*) FILTER (WHERE s.current_stock > s.minimum_stock)::int AS above
         FROM branch_ingredients s JOIN branches b ON b.id = s.branch_id
         WHERE b.name = ANY($1) GROUP BY b.name`,
      [branchNames],
    );
    expect(rows).toHaveLength(branchNames.length);
    for (const row of rows) {
      expect(row.below).toBeGreaterThan(0);
      expect(row.equal).toBeGreaterThan(0);
      expect(row.above).toBeGreaterThan(0);
    }
  });
  it('asigna valores propios por sucursal, con un caso de stock cero', async () => {
    const rows = await stockSnapshot();
    const [centro, santaTecla] = branchNames;
    expect(find(rows, centro, 'Fideos de ramen')).toMatchObject({
      unit: 'kg',
      current_stock: '3.000',
      minimum_stock: '5.000',
    });
    expect(find(rows, santaTecla, 'Fideos de ramen')).toMatchObject({
      unit: 'kg',
      current_stock: '12.000',
      minimum_stock: '5.000',
    });
    expect(find(rows, centro, 'Salsa de soya').current_stock).toBe('0.000');
  });
  it(
    'no cambia existencias, fechas ni identificadores al repetirse',
    async () => {
      const before = await stockSnapshot();
      const ingredients = await prisma.ingredient.findMany({
        orderBy: { name: 'asc' },
      });

      await seedInventoryData(prisma);

      expect(before).toHaveLength(8);
      expect(await stockSnapshot()).toEqual(before);
      expect(
        await prisma.ingredient.findMany({ orderBy: { name: 'asc' } }),
      ).toEqual(ingredients);
    },
    SEED_TIMEOUT_MS,
  );
  it(
    'conserva existencias y fecha modificadas después del primer seed',
    async () => {
      await withRestoredStock(async () => {
        const historicDate = '2026-01-01T00:00:00.000Z';
        const [row] = await stockSnapshot();
        await client.query(
          'UPDATE branch_ingredients SET current_stock=77, minimum_stock=33, updated_at=$1 WHERE id=$2',
          [historicDate, row.id],
        );
        const modified = await stockSnapshot();

        await seedInventoryData(prisma);

        const after = await stockSnapshot();
        expect(after).toEqual(modified);
        const seeded = after.find(({ id }) => id === row.id);
        expect(seeded?.current_stock).toBe('77.000');
        expect(seeded?.minimum_stock).toBe('33.000');
        expect(seeded?.updated_at.toISOString()).toBe(historicDate);
      });
    },
    SEED_TIMEOUT_MS,
  );
  it(
    'actualiza updated_at al cambiar existencias desde Prisma',
    async () => {
      await withRestoredStock(async () => {
        const [row] = await stockSnapshot();
        await client.query(
          "UPDATE branch_ingredients SET updated_at = updated_at - interval '1 hour' WHERE id=$1",
          [row.id],
        );
        const previous = await prisma.branchIngredient.findUniqueOrThrow({
          where: { id: row.id },
        });

        const updated = await prisma.branchIngredient.update({
          where: { id: row.id },
          data: { currentStock: '50' },
        });

        expect(updated.updatedAt.getTime()).toBeGreaterThan(
          previous.updatedAt.getTime(),
        );
        expect(updated.createdAt).toEqual(previous.createdAt);
      });
    },
    SEED_TIMEOUT_MS,
  );
});
