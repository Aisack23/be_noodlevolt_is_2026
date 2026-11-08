import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { Client } from 'pg';

const MIGRATION = '20261108120000_loyalty_accounts';
const root = new URL('../prisma/migrations/', import.meta.url);

describe.sequential('DB-07: migración y reversión sin pérdida de datos', () => {
  let client: Client;
  let namespace: string;
  let previous: string[];
  let up: string;
  let down: string;
  let userId: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL)
      throw new Error('Se requiere DATABASE_URL de pruebas.');
    client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    const entries = await readdir(root, { withFileTypes: true });
    previous = await Promise.all(
      entries
        .filter((e) => e.isDirectory() && e.name < MIGRATION)
        .map((e) => e.name)
        .sort()
        .map((name) =>
          readFile(new URL(`${name}/migration.sql`, root), 'utf8'),
        ),
    );
    up = await readFile(new URL(`${MIGRATION}/migration.sql`, root), 'utf8');
    down = await readFile(new URL(`${MIGRATION}/down.sql`, root), 'utf8');
  });
  beforeEach(async () => {
    // Cada caso usa su propio esquema en DATABASE_URL, sin crear ni tocar otras bases.
    namespace = `db07_${randomUUID().replaceAll('-', '')}`;
    await client.query(`CREATE SCHEMA "${namespace}"`);
    await client.query(`SET search_path TO "${namespace}"`);
    for (const sql of previous) await client.query(sql);
    userId = randomUUID();
    await client.query(
      `INSERT INTO users (id,email,name,password_hash,updated_at)
       VALUES ($1,$2,'Migración','test',now())`,
      [userId, `${userId}@example.com`],
    );
  }, 20_000);
  afterEach(async () => {
    await client.query('ROLLBACK');
    await client.query('SET search_path TO public');
    if (/^db07_[a-f0-9]{32}$/.test(namespace))
      await client.query(`DROP SCHEMA "${namespace}" CASCADE`);
  });
  afterAll(async () => {
    if (client) await client.end();
  });

  async function schema() {
    const queries = [
      `SELECT table_name,column_name,data_type,udt_name,is_nullable,column_default
       FROM information_schema.columns WHERE table_schema=current_schema()
       ORDER BY table_name,ordinal_position`,
      `SELECT c.relname,con.conname,pg_get_constraintdef(con.oid) AS definition
       FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid
       JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=current_schema()
       ORDER BY c.relname,con.conname`,
      `SELECT tablename,indexname,indexdef FROM pg_indexes
       WHERE schemaname=current_schema() ORDER BY tablename,indexname`,
    ];
    const snapshot: unknown[] = [];
    for (const sql of queries) snapshot.push((await client.query(sql)).rows);
    return snapshot;
  }
  function movement(
    points: number,
    type = 'EARN',
    paymentId: string | null = null,
    customerId = userId,
  ) {
    return client.query(
      'INSERT INTO points_movements (id,customer_id,type,points,payment_id) VALUES ($1,$2,$3,$4,$5)',
      [randomUUID(), customerId, type, points, paymentId],
    );
  }
  async function history() {
    return (await client.query('SELECT * FROM points_movements ORDER BY id'))
      .rows;
  }
  async function rejectsUp(code: string, constraint?: string) {
    const before = await schema();
    const rows = await history();
    await expect(client.query(up)).rejects.toMatchObject({ code, constraint });
    await client.query('ROLLBACK');
    expect(await schema()).toEqual(before);
    expect(await history()).toEqual(rows);
  }

  it('aplica, revierte y reaplica con las mismas columnas, restricciones e índices', async () => {
    const before = await schema();
    await client.query(up);
    const after = await schema();
    expect(after).not.toEqual(before);
    await client.query(down);
    expect(await schema()).toEqual(before);
    await client.query(up);
    expect(await schema()).toEqual(after);
  });
  it('inicializa saldos desde el historial con signo y conserva todos los movimientos', async () => {
    await movement(8);
    await movement(-3, 'REDEEM');
    await movement(-1, 'ADJUSTMENT');
    const other = randomUUID();
    await client.query(
      `INSERT INTO users (id,email,name,password_hash,updated_at) VALUES ($1,$2,'Otro','test',now())`,
      [other, `${other}@example.com`],
    );
    await movement(7, 'EARN', null, other);
    const rows = await history();
    await client.query(up);
    const balances = await client.query<{ user_id: string; points: number }>(
      'SELECT user_id,points FROM loyalty_accounts ORDER BY user_id',
    );
    expect(balances.rows).toEqual(
      [
        { user_id: userId, points: 4 },
        { user_id: other, points: 7 },
      ].sort((a, b) => a.user_id.localeCompare(b.user_id)),
    );
    expect(await history()).toEqual(rows);
  });
  it.each([0, 5])(
    'rechaza el down con una cuenta de %i puntos, sin borrar datos ni restricciones',
    async (points) => {
      await client.query(up);
      await client.query(
        'INSERT INTO loyalty_accounts (user_id,points) VALUES ($1,$2)',
        [userId, points],
      );
      const before = await schema();
      const rows = (await client.query('SELECT * FROM loyalty_accounts')).rows;
      await expect(client.query(down)).rejects.toMatchObject({ code: 'P0001' });
      await client.query('ROLLBACK');
      expect(await schema()).toEqual(before);
      expect(
        (await client.query('SELECT * FROM loyalty_accounts')).rows,
      ).toEqual(rows);
    },
  );
  it('rechaza acumulaciones duplicadas preexistentes y conserva el esquema anterior', async () => {
    const branch = randomUUID();
    const payment = randomUUID();
    await client.query(
      "INSERT INTO branches (id,name,address) VALUES ($1,$2,'Prueba')",
      [branch, branch],
    );
    await client.query(
      `INSERT INTO payments (id,branch_id,subtotal,total_paid,status) VALUES ($1,$2,8.75,8.75,'PAID')`,
      [payment, branch],
    );
    await movement(8, 'EARN', payment);
    await movement(8, 'EARN', payment);
    await rejectsUp('23505', 'points_movements_one_earn_per_payment');
  });
  it.each([0, -1])(
    'rechaza EARN preexistente de %i puntos sin cambios parciales',
    async (points) => {
      await movement(points);
      await rejectsUp('23514', 'points_movements_earn_positive');
    },
  );
  it('rechaza un saldo histórico negativo sin eliminar canjes', async () => {
    await movement(-1, 'REDEEM');
    await rejectsUp('23514', 'loyalty_accounts_points_nonnegative');
  });
  it('rechaza desbordamiento de INT sin truncar ni perder puntos', async () => {
    await movement(2_147_483_647);
    await movement(1);
    await rejectsUp('22003');
  });
});
