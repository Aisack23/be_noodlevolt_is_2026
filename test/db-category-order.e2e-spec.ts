import { randomUUID } from 'node:crypto';
import { databaseFixture } from './support/database.js';

describe.sequential('Orden de presentación de categorías', () => {
  const db = databaseFixture();

  it('aplica el default 0 al omitir display_order', async () => {
    const id = randomUUID();
    const result = await db.client.query<{ display_order: number }>(
      'INSERT INTO categories (id,branch_id,name) VALUES ($1,$2,$3) RETURNING display_order',
      [id, db.branches[0], id],
    );
    expect(result.rows[0].display_order).toBe(0);
  });
  it('conserva un orden entero explícito', async () => {
    const id = randomUUID();
    const result = await db.client.query<{ display_order: number }>(
      'INSERT INTO categories (id,branch_id,name,display_order) VALUES ($1,$2,$3,3) RETURNING display_order',
      [id, db.branches[0], id],
    );
    expect(result.rows[0].display_order).toBe(3);
  });
  it('rechaza display_order nulo', async () => {
    const id = randomUUID();
    await db.rejectWrite(
      () =>
        db.client.query(
          'INSERT INTO categories (id,branch_id,name,display_order) VALUES ($1,$2,$3,NULL)',
          [id, db.branches[0], id],
        ),
      '23502',
    );
  });
});
