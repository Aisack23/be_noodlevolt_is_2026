import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { databaseFixture } from './support/database.js';

const ORDER_NUMBER = /^ORD-\d{6}$/;

describe('HU-03: número legible de pedidos contra PostgreSQL', () => {
  const db = databaseFixture();
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20,
  });
  // La concurrencia necesita filas confirmadas que vean otras conexiones; el
  // fixture usa una transacción por prueba que nadie más puede leer.
  const committedBranch = randomUUID();

  beforeAll(async () => {
    await pool.query(
      "INSERT INTO branches (id,name,address) VALUES ($1,'HU-03 concurrencia','Prueba')",
      [committedBranch],
    );
  });

  afterAll(async () => {
    await pool.query('DELETE FROM orders WHERE branch_id=$1', [committedBranch]);
    await pool.query('DELETE FROM branches WHERE id=$1', [committedBranch]);
    await pool.end();
  });

  type Runner = {
    query(
      text: string,
      values: unknown[],
    ): Promise<{ rows: { order_number: string }[] }>;
  };

  function insertDineIn(runner: Runner, branchId: string) {
    return runner.query(
      `INSERT INTO orders (id,branch_id,type,status,operation_id,updated_at)
       VALUES ($1,$2,'DINE_IN','PENDING',$3,now())
       RETURNING order_number`,
      [randomUUID(), branchId, randomUUID()],
    );
  }

  it('asigna número a pedidos de salón y para llevar sin que la aplicación lo envíe', async () => {
    const dineIn = await insertDineIn(db.client, db.branches[0]);
    const takeout = await db.client.query<{ order_number: string }>(
      `INSERT INTO orders (id,branch_id,type,status,operation_id,updated_at,payment_mode)
       VALUES ($1,$2,'TAKEOUT','PENDING',$3,now(),'ONLINE')
       RETURNING order_number`,
      [randomUUID(), db.branches[0], randomUUID()],
    );

    const [first, second] = [
      dineIn.rows[0].order_number,
      takeout.rows[0].order_number,
    ];
    expect(first).toMatch(ORDER_NUMBER);
    expect(second).toMatch(ORDER_NUMBER);
    expect(Number(second.slice(4))).toBe(Number(first.slice(4)) + 1);
  });

  it('no repite números bajo inserciones concurrentes en transacciones separadas', async () => {
    const inserts = Array.from({ length: 40 }, () =>
      insertDineIn(pool, committedBranch),
    );
    const numbers = (await Promise.all(inserts)).map(
      (result) => result.rows[0].order_number,
    );

    expect(numbers).toHaveLength(40);
    expect(new Set(numbers).size).toBe(40);
    for (const number of numbers) expect(number).toMatch(ORDER_NUMBER);
  });

  it('conserva el número cuando el pedido cambia de estado', async () => {
    const created = await insertDineIn(db.client, db.branches[0]);
    const orderNumber = created.rows[0].order_number;
    const updated = await db.client.query<{ order_number: string }>(
      `UPDATE orders SET status='READY', updated_at=now()
       WHERE order_number=$1 RETURNING order_number`,
      [orderNumber],
    );

    expect(updated.rows[0].order_number).toBe(orderNumber);
  });

  it('rechaza un pedido con número NULL explícito', async () => {
    await db.rejectWrite(
      () =>
        db.client.query(
          `INSERT INTO orders (id,branch_id,type,status,operation_id,updated_at,order_number)
           VALUES ($1,$2,'DINE_IN','PENDING',$3,now(),NULL)`,
          [randomUUID(), db.branches[0], randomUUID()],
        ),
      '23502',
    );
  });
});
