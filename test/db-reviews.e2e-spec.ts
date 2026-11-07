import { randomUUID } from 'node:crypto';
import { databaseFixture } from './support/database.js';

describe.sequential('DB reviews', () => {
  const db = databaseFixture();

  async function createCustomer() {
    return db.client.query(
      `INSERT INTO users (id,name,email,password_hash,role,updated_at)
       VALUES ($1,$2,$3,$4,$5, now()) RETURNING id`,
      [
        randomUUID(),
        'Cliente',
        `${randomUUID()}@example.com`,
        'hash',
        'CLIENT',
      ],
    );
  }

  async function createOrder(branchId: string, customerId: string) {
    return db.client.query(
      `INSERT INTO orders (
         id, branch_id, customer_id, type, status, operation_id, total, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7, now()) RETURNING id`,
      [
        randomUUID(),
        branchId,
        customerId,
        'DINE_IN',
        'PENDING',
        randomUUID(),
        '0',
      ],
    );
  }

  async function createReview(
    orderId: string,
    customerId: string,
    branchId: string,
    rating: number,
  ) {
    return db.client.query(
      `INSERT INTO reviews (id, order_id, customer_id, branch_id, rating)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [randomUUID(), orderId, customerId, branchId, rating],
    );
  }

  it('rechaza dos reseñas para el mismo pedido', async () => {
    const customer = (await createCustomer()).rows[0];
    const order = (await createOrder(db.branches[0], customer.id)).rows[0];
    await createReview(order.id, customer.id, db.branches[0], 5);

    await db.rejectWrite(
      () => createReview(order.id, customer.id, db.branches[0], 4),
      '23505',
      'reviews_order_id_key',
    );
  });

  it.each([0, 6])('rechaza rating fuera de rango %i', async (rating) => {
    const customer = (await createCustomer()).rows[0];
    const order = (await createOrder(db.branches[0], customer.id)).rows[0];

    await db.rejectWrite(
      () => createReview(order.id, customer.id, db.branches[0], rating),
      '23514',
      'reviews_rating_range',
    );
  });

  it('acepta una review válida', async () => {
    const customer = (await createCustomer()).rows[0];
    const order = (await createOrder(db.branches[0], customer.id)).rows[0];

    const result = await createReview(order.id, customer.id, db.branches[0], 5);
    expect(result.rowCount).toBe(1);
  });
});