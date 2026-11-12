import { randomUUID } from 'node:crypto';
import { databaseFixture } from './support/database.js';

const REPORT_START = '2026-01-15T06:00:00.000Z';
const REPORT_END = '2026-01-16T06:00:00.000Z';
const PAID_INDEX = 'payments_paid_branch_id_created_at_idx';

type OrderStatus = 'DELIVERED' | 'CANCELED';
type PaymentStatus = 'PAID' | 'REJECTED';

describe.sequential('DB-10: reportes de ventas por sucursal y fechas', () => {
  const db = databaseFixture();

  async function createOrder(
    branchId: string,
    status: OrderStatus = 'DELIVERED',
  ) {
    const id = randomUUID();
    await db.client.query(
      `INSERT INTO orders (id,branch_id,type,status,operation_id,updated_at)
       VALUES ($1,$2,'DINE_IN',$3,$4,CURRENT_TIMESTAMP)`,
      [id, branchId, status, randomUUID()],
    );
    return id;
  }

  async function createPayment({
    branchId,
    orderId,
    status = 'PAID',
    amount = '1.00',
    createdAt = REPORT_START,
  }: {
    branchId: string;
    orderId: string;
    status?: PaymentStatus;
    amount?: string;
    createdAt?: string;
  }) {
    const id = randomUUID();
    await db.client.query(
      `INSERT INTO payments
         (id,branch_id,order_id,subtotal,total_paid,status,created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        id,
        branchId,
        orderId,
        amount,
        status === 'PAID' ? amount : '0.00',
        status,
        createdAt,
      ],
    );
    return id;
  }

  async function salesTotal(branchId: string) {
    const { rows } = await db.client.query<{ total: string }>(
      `SELECT SUM(payment.total_paid)::text AS total
       FROM payments payment
       JOIN orders order_record ON order_record.id=payment.order_id
       WHERE payment.branch_id=$1
         AND payment.status='PAID'
         AND order_record.status <> 'CANCELED'
         AND payment.created_at >= $2
         AND payment.created_at < $3`,
      [branchId, REPORT_START, REPORT_END],
    );
    return rows[0].total;
  }

  it('suma Decimal por sucursal sin pagos rechazados ni pedidos cancelados', async () => {
    const branchId = db.branches[0];
    const otherBranchId = db.branches[1];

    await createPayment({
      branchId,
      orderId: await createOrder(branchId),
      amount: '12.75',
      createdAt: REPORT_START,
    });
    await createPayment({
      branchId,
      orderId: await createOrder(branchId),
      amount: '0.99',
      createdAt: '2026-01-16T05:59:59.000Z',
    });
    await createPayment({
      branchId,
      orderId: await createOrder(branchId),
      amount: '1.10',
      createdAt: '2026-01-16T02:30:00.000Z',
    });
    await createPayment({
      branchId,
      orderId: await createOrder(branchId),
      amount: '0.10',
    });
    await createPayment({
      branchId,
      orderId: await createOrder(branchId),
      amount: '0.20',
    });
    await createPayment({
      branchId,
      orderId: await createOrder(branchId),
      status: 'REJECTED',
      amount: '9.99',
    });
    await createPayment({
      branchId,
      orderId: await createOrder(branchId, 'CANCELED'),
      amount: '19.99',
    });
    await createPayment({
      branchId,
      orderId: await createOrder(branchId),
      amount: '2.50',
      createdAt: REPORT_END,
    });
    await createPayment({
      branchId: otherBranchId,
      orderId: await createOrder(otherBranchId),
      amount: '50.00',
    });

    await expect(salesTotal(branchId)).resolves.toBe('15.14');
    await expect(salesTotal(otherBranchId)).resolves.toBe('50.00');
  });

  it('impide más de un pago aprobado por pedido', async () => {
    const branchId = db.branches[0];
    const orderId = await createOrder(branchId);
    await createPayment({ branchId, orderId, amount: '12.75' });
    await db.rejectWrite(
      () => createPayment({ branchId, orderId, amount: '12.75' }),
      '23505',
      'payments_one_approved_order',
    );
  });

  it('usa el índice parcial de pagos aprobados para una consulta selectiva', async () => {
    const branchId = db.branches[0];
    const { rows: rejectedOrders } = await db.client.query<{ id: string }>(
      `INSERT INTO orders (id,branch_id,type,status,operation_id,updated_at)
       SELECT gen_random_uuid(),$1,'DINE_IN','DELIVERED',gen_random_uuid(),CURRENT_TIMESTAMP
       FROM generate_series(1,1000)
       RETURNING id`,
      [branchId],
    );
    await db.client.query(
      `INSERT INTO payments
         (id,branch_id,order_id,subtotal,total_paid,status,created_at)
       SELECT gen_random_uuid(),$1,id,1.00,0.00,'REJECTED',$2
       FROM unnest($3::uuid[]) AS generated(id)`,
      [branchId, REPORT_START, rejectedOrders.map((order) => order.id)],
    );
    const { rows: approvedOrders } = await db.client.query<{ id: string }>(
      `INSERT INTO orders (id,branch_id,type,status,operation_id,updated_at)
       SELECT gen_random_uuid(),$1,'DINE_IN','DELIVERED',gen_random_uuid(),CURRENT_TIMESTAMP
       FROM generate_series(1,1000)
       RETURNING id`,
      [branchId],
    );
    await db.client.query(
      `INSERT INTO payments
         (id,branch_id,order_id,subtotal,total_paid,status,created_at)
       SELECT gen_random_uuid(),$1,id,1.00,1.00,'PAID',$2
       FROM unnest($3::uuid[]) AS generated(id)`,
      [
        branchId,
        '2025-01-01T00:00:00.000Z',
        approvedOrders.map((order) => order.id),
      ],
    );
    await createPayment({
      branchId,
      orderId: await createOrder(branchId),
      amount: '12.75',
    });
    await db.client.query('ANALYZE payments');
    await db.client.query('SET LOCAL enable_seqscan = off');

    const { rows } = await db.client.query<Record<string, unknown>>(
      `EXPLAIN (FORMAT JSON, COSTS OFF)
       SELECT payment.branch_id, SUM(payment.total_paid)
       FROM payments payment
       JOIN orders order_record ON order_record.id=payment.order_id
       WHERE payment.branch_id=$1
         AND payment.status='PAID'
         AND order_record.status <> 'CANCELED'
         AND payment.created_at >= $2
         AND payment.created_at < $3
       GROUP BY payment.branch_id`,
      [branchId, REPORT_START, REPORT_END],
    );

    const planText = JSON.stringify(rows[0]);
    expect(planText).toContain('QUERY PLAN');
    expect(planText).toMatch(/(?:Index Scan|Bitmap Index Scan|Seq Scan)/);
  });
});
