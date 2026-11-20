import { randomUUID } from 'node:crypto';
import { databaseFixture } from './support/database.js';

describe('DB BE-2.2.1: modalidad de pago del pedido', () => {
  const db = databaseFixture();

  function insertOrder(type: 'DINE_IN' | 'TAKEOUT', mode: string | null) {
    return db.client.query(
      `INSERT INTO orders (id,branch_id,type,payment_mode,operation_id,updated_at)
       VALUES ($1,$2,$3,$4,$5,now())`,
      [randomUUID(), db.branches[0], type, mode, randomUUID()],
    );
  }

  it('admite SALA sin modalidad y LLEVAR con ambas modalidades', async () => {
    await insertOrder('DINE_IN', null);
    await insertOrder('TAKEOUT', 'ONLINE');
    await insertOrder('TAKEOUT', 'AT_COUNTER');
  });

  it('rechaza LLEVAR sin modalidad con el CHECK nombrado', async () => {
    await db.rejectWrite(
      () => insertOrder('TAKEOUT', null),
      '23514',
      'orders_type_payment_mode_check',
    );
  });

  it('rechaza SALA con modalidad con el CHECK nombrado', async () => {
    await db.rejectWrite(
      () => insertOrder('DINE_IN', 'ONLINE'),
      '23514',
      'orders_type_payment_mode_check',
    );
  });
});
