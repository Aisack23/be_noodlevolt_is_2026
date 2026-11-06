import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { Client } from 'pg';

const database = `be06_${randomUUID().replaceAll('-', '')}`;
const branchId = randomUUID();
const orderId = randomUUID();

describe.sequential(
  'BE-06: restricciones de pagos en PostgreSQL real, sin Prisma',
  () => {
    let admin: Client;
    let client: Client;
    let created = false;

    beforeAll(async () => {
      if (!process.env.DATABASE_URL)
        throw new Error('Se requiere DATABASE_URL.');
      admin = new Client({ connectionString: process.env.DATABASE_URL });
      await admin.connect();
      await admin.query(`CREATE DATABASE "${database}"`);
      created = true;
      const url = new URL(process.env.DATABASE_URL);
      url.pathname = `/${database}`;
      client = new Client({ connectionString: url.toString() });
      await client.connect();
      const root = new URL('../prisma/migrations/', import.meta.url);
      const entries = await readdir(root, { withFileTypes: true });
      for (const name of entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort()) {
        await client.query(
          await readFile(new URL(`${name}/migration.sql`, root), 'utf8'),
        );
      }
      await client.query(
        'INSERT INTO branches (id,name,address) VALUES ($1,$2,$3)',
        [branchId, branchId, 'Test'],
      );
      await client.query(
        "INSERT INTO orders (id,branch_id,type,payment_mode,operation_id,updated_at) VALUES ($1,$2,'TAKEOUT','ONLINE',gen_random_uuid(),CURRENT_TIMESTAMP)",
        [orderId, branchId],
      );
    }, 20000);
    beforeEach(async () => {
      await client.query('BEGIN');
    });
    afterEach(async () => {
      await client.query('ROLLBACK');
    });
    afterAll(async () => {
      if (client) await client.end();
      if (admin) {
        try {
          if (created) await admin.query(`DROP DATABASE "${database}"`);
        } finally {
          await admin.end();
        }
      }
    });

    async function insert(status: 'PAID' | 'REJECTED', amount = '17.00') {
      const id = randomUUID();
      await client.query(
        'INSERT INTO payments (id,branch_id,order_id,subtotal,total_paid,status,last4) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [
          id,
          branchId,
          orderId,
          amount,
          status === 'PAID' ? amount : '0.00',
          status,
          status === 'PAID' ? '4242' : '0002',
        ],
      );
      return id;
    }
    async function reject(write: () => Promise<unknown>, code: string) {
      await client.query('SAVEPOINT bad_write');
      try {
        await expect(write()).rejects.toMatchObject({ code });
      } finally {
        await client.query('ROLLBACK TO SAVEPOINT bad_write');
      }
    }

    it('conserva varios rechazos y permite aprobar después', async () => {
      await insert('REJECTED');
      await insert('REJECTED');
      await insert('PAID');
      const rows = await client.query(
        'SELECT status,total_paid::text FROM payments WHERE order_id=$1 ORDER BY total_paid',
        [orderId],
      );
      expect(rows.rows).toHaveLength(3);
      expect(
        rows.rows
          .filter((row) => row.status === 'REJECTED')
          .every((row) => row.total_paid === '0.00'),
      ).toBe(true);
    });
    it('impide un segundo aprobado mediante índice único parcial', async () => {
      await insert('PAID');
      await reject(() => insert('PAID'), '23505');
    });
    it('permite un único comprobante por pago', async () => {
      const payment = await insert('PAID');
      const write = () =>
        client.query(
          'INSERT INTO simple_receipts (id,payment_id,number,amount) VALUES ($1,$2,$3,$4)',
          [randomUUID(), payment, randomUUID(), '17.00'],
        );
      await write();
      await reject(write, '23505');
    });
    it('valida cuatro dígitos y no introduce columnas PAN/CVV', async () => {
      const payment = await insert('REJECTED');
      await reject(
        () =>
          client.query('UPDATE payments SET last4=$1 WHERE id=$2', [
            'abcd',
            payment,
          ]),
        '23514',
      );
      const columns = await client.query(
        "SELECT column_name FROM information_schema.columns WHERE table_name IN ('payments','simple_receipts') AND column_name IN ('pan','cvv','card_number','card_token')",
      );
      expect(columns.rows).toHaveLength(0);
    });
    it('soporta el importe máximo derivado de pedidos sin perder precisión', async () => {
      const payment = await insert('PAID', '199999999980.00');
      const rows = await client.query(
        'SELECT total_paid::text FROM payments WHERE id=$1',
        [payment],
      );
      expect(rows.rows[0].total_paid).toBe('199999999980.00');
    });
  },
);
