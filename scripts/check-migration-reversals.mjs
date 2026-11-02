import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import pg from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString)
  throw new Error(
    'DATABASE_URL es obligatorio y debe apuntar al PostgreSQL de Docker.',
  );

const database = `hu_reversal_${randomUUID().replaceAll('-', '')}`;
const testUrl = new URL(connectionString);
testUrl.pathname = `/${database}`;
const admin = new pg.Client({ connectionString });
const client = new pg.Client({ connectionString: testUrl.toString() });
const migrations = new URL('../prisma/migrations/', import.meta.url);
const directories = (await readdir(migrations, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

async function schema() {
  const queries = [
    `SELECT table_name, column_name, data_type, udt_name, is_nullable,
            column_default, character_maximum_length, numeric_precision, numeric_scale
       FROM information_schema.columns WHERE table_schema = 'public'
       ORDER BY table_name, ordinal_position`,
    `SELECT c.relname, con.conname, pg_get_constraintdef(con.oid) AS definition
       FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' ORDER BY c.relname, con.conname`,
    `SELECT tablename, indexname, indexdef FROM pg_indexes
       WHERE schemaname = 'public' ORDER BY tablename, indexname`,
    `SELECT t.typname, e.enumlabel FROM pg_type t
       JOIN pg_enum e ON e.enumtypid = t.oid
       JOIN pg_namespace n ON n.oid = t.typnamespace
       WHERE n.nspname = 'public' ORDER BY t.typname, e.enumsortorder`,
  ];
  const snapshot = [];
  for (const query of queries) snapshot.push((await client.query(query)).rows);
  return snapshot;
}

async function checkRefusal(directory, down) {
  const enums = directory.endsWith('base_anexo_a');
  const branchColumn = directory.endsWith('catalogo_pedidos_hu');
  if (!enums && !branchColumn) return;
  const branch = randomUUID();
  const record = randomUUID();
  const category = randomUUID();
  await client.query(
    'INSERT INTO branches (id,name,address) VALUES ($1,$2,$3)',
    [branch, branch, 'Prueba aislada'],
  );
  if (enums) {
    await client.query(
      `INSERT INTO users (id,email,name,last_name,password_hash,role,branch_id,updated_at)
      VALUES ($1,$2,'Inventario','Prueba','test','INVENTORY_MANAGER',$3,now())`,
      [record, `${record}@example.com`, branch],
    );
  } else {
    await client.query('INSERT INTO categories (id,name) VALUES ($1,$2)', [
      category,
      category,
    ]);
    await client.query(
      'INSERT INTO dishes (id,branch_id,category_id,name,price) VALUES ($1,$2,$3,$4,1)',
      [record, branch, category, record],
    );
  }
  const before = await schema();
  await assert.rejects(client.query(down), { code: 'P0001' });
  await client.query('ROLLBACK');
  assert.deepEqual(
    await schema(),
    before,
    `Un rechazo no debe alterar el schema: ${directory}`,
  );
  const table = enums ? 'users' : 'dishes';
  const rows = await client.query(
    `DELETE FROM "${table}" WHERE id=$1 RETURNING id`,
    [record],
  );
  assert.equal(
    rows.rowCount,
    1,
    'El down rechazado debe conservar el dato protegido',
  );
  if (branchColumn)
    await client.query('DELETE FROM categories WHERE id=$1', [category]);
  await client.query('DELETE FROM branches WHERE id=$1', [branch]);
}

await admin.connect();
let created = false;
try {
  await admin.query(`CREATE DATABASE "${database}"`);
  created = true;
  await client.connect();
  const owned = [];
  for (const directory of directories) {
    const up = await readFile(
      new URL(`${directory}/migration.sql`, migrations),
      'utf8',
    );
    let down;
    try {
      down = await readFile(
        new URL(`${directory}/down.sql`, migrations),
        'utf8',
      );
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const before = down ? await schema() : null;
    await client.query(up);
    if (!down) continue;
    const after = await schema();
    await checkRefusal(directory, down);
    await client.query(down);
    assert.deepEqual(
      await schema(),
      before,
      `Reversión incompleta: ${directory}`,
    );
    await client.query(up);
    assert.deepEqual(
      await schema(),
      after,
      `Reaplicación distinta: ${directory}`,
    );
    owned.push({ directory, up, down });
    process.stdout.write(`OK aplicar/revertir/reaplicar: ${directory}\n`);
  }
  assert(
    owned.length > 0,
    'Se requiere al menos una migración propia con down.sql',
  );

  const finalSchema = await schema();
  for (const { down } of [...owned].reverse()) await client.query(down);
  for (const { up } of owned) await client.query(up);
  assert.deepEqual(
    await schema(),
    finalSchema,
    'El ciclo completo debe reconstruir el schema',
  );
  process.stdout.write(
    'OK: ciclo completo de las migraciones propias; columnas, índices, CHECK, FK y enums idénticos.\n',
  );
} finally {
  await client.end();
  // Solo se elimina la base aleatoria creada por este proceso; nunca DATABASE_URL.
  if (created) await admin.query(`DROP DATABASE "${database}"`);
  await admin.end();
}
