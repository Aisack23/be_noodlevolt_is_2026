import { randomUUID } from 'node:crypto';
import { databaseFixture } from './support/database.js';

describe.sequential('DB-01: categorías y platillos por sucursal', () => {
  const db = databaseFixture();
  let categories: string[];

  beforeEach(async () => {
    categories = [
      await createCategory(db.branches[0], 'Bebidas'),
      await createCategory(db.branches[1], 'Bebidas'),
    ];
  });

  async function createCategory(branchId: string, name: string) {
    const result = await db.client.query<{ id: string }>(
      'INSERT INTO categories (id,branch_id,name) VALUES ($1,$2,$3) RETURNING id',
      [randomUUID(), branchId, name],
    );
    return result.rows[0].id;
  }
  function createDish(
    branchId = db.branches[0],
    categoryId = categories[0],
    price = '8.50',
  ) {
    return db.client.query<{
      id: string;
      price: string;
      is_available: boolean;
      is_deleted: boolean;
      created_at: Date;
      updated_at: Date;
    }>(
      'INSERT INTO dishes (id,branch_id,category_id,name,price) VALUES ($1,$2,$3,$4,$5) RETURNING id,price,is_available,is_deleted,created_at,updated_at',
      [randomUUID(), branchId, categoryId, randomUUID(), price],
    );
  }

  it('permite el mismo nombre de categoría en otra sucursal', () => {
    expect(categories[0]).not.toBe(categories[1]);
  });
  it('rechaza nombre de categoría repetido en la misma sucursal', async () => {
    await db.rejectWrite(
      () => createCategory(db.branches[0], 'Bebidas'),
      '23505',
      'categories_branch_id_name_key',
    );
  });
  it('exige categoría con sucursal existente y no nula', async () => {
    await db.rejectWrite(
      () => createCategory(randomUUID(), 'Sin sucursal'),
      '23503',
      'categories_branch_id_fkey',
    );
    await db.rejectWrite(
      () =>
        db.client.query('INSERT INTO categories (id,name) VALUES ($1,$2)', [
          randomUUID(),
          'Sin sucursal',
        ]),
      '23502',
    );
  });
  it('asigna fechas de auditoría a la categoría', async () => {
    const { rows } = await db.client.query<{
      created_at: Date;
      updated_at: Date;
    }>('SELECT created_at,updated_at FROM categories WHERE id=$1', [
      categories[0],
    ]);
    expect(rows[0].created_at).toBeInstanceOf(Date);
    expect(rows[0].updated_at).toBeInstanceOf(Date);
  });
  it('rechaza platillo en una categoría de otra sucursal', async () => {
    await db.rejectWrite(
      () => createDish(db.branches[0], categories[1]),
      '23503',
      'dishes_branch_id_category_id_fkey',
    );
  });
  it('rechaza mover un platillo a una categoría de otra sucursal', async () => {
    const { id } = (await createDish()).rows[0];
    await db.rejectWrite(
      () =>
        db.client.query('UPDATE dishes SET category_id=$1 WHERE id=$2', [
          categories[1],
          id,
        ]),
      '23503',
      'dishes_branch_id_category_id_fkey',
    );
  });
  it('impide borrar una categoría con platillos o una sucursal con categorías', async () => {
    await createDish();
    await db.rejectWrite(
      () =>
        db.client.query('DELETE FROM categories WHERE id=$1', [categories[0]]),
      '23001',
      'dishes_branch_id_category_id_fkey',
    );
    await db.rejectWrite(
      () =>
        db.client.query('DELETE FROM branches WHERE id=$1', [db.branches[1]]),
      '23001',
      'categories_branch_id_fkey',
    );
  });
  it('crea platillos disponibles, no eliminados y con fechas de auditoría', async () => {
    const dish = (await createDish()).rows[0];
    expect(dish.is_available).toBe(true);
    expect(dish.is_deleted).toBe(false);
    expect(dish.created_at).toBeInstanceOf(Date);
    expect(dish.updated_at).toBeInstanceOf(Date);
  });
  it.each(['is_available', 'is_deleted'])('rechaza %s nulo', async (column) => {
    const { id } = (await createDish()).rows[0];
    await db.rejectWrite(
      () =>
        db.client.query(`UPDATE dishes SET ${column}=NULL WHERE id=$1`, [id]),
      '23502',
    );
  });
  it('acepta el mayor precio de NUMERIC(10,2) y rechaza el siguiente', async () => {
    expect(
      (await createDish(undefined, undefined, '99999999.99')).rows[0].price,
    ).toBe('99999999.99');
    await db.rejectWrite(
      () => createDish(undefined, undefined, '100000000.00'),
      '22003',
    );
  });
  it('mantiene el CHECK de precio positivo', async () => {
    await db.rejectWrite(
      () => createDish(undefined, undefined, '0'),
      '23514',
      'dishes_price_check',
    );
  });
  it('indexa platillos por sucursal y categoría', async () => {
    const { rows } = await db.client.query<{ indexdef: string }>(
      "SELECT indexdef FROM pg_indexes WHERE indexname='dishes_branch_id_category_id_idx'",
    );
    expect(rows[0].indexdef).toContain('(branch_id, category_id)');
  });
  it('guarda las fechas de catálogo con zona horaria', async () => {
    const { rows } = await db.client.query<{ data_type: string }>(
      `SELECT data_type FROM information_schema.columns
         WHERE table_schema='public' AND column_name IN ('created_at','updated_at')
           AND table_name IN ('categories','dishes')`,
    );
    expect(rows).toHaveLength(4);
    expect(
      rows.every(({ data_type }) => data_type === 'timestamp with time zone'),
    ).toBe(true);
  });
});
