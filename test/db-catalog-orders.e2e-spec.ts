import { randomUUID } from 'node:crypto';
import { databaseFixture } from './support/database.js';

describe.sequential(
  'DB-1.1.1 y DB-2.1.1: catálogo y líneas por sucursal',
  () => {
    const db = databaseFixture();
    let categoryId: string;
    let dishId: string;
    let orderId: string;

    beforeEach(async () => {
      categoryId = randomUUID();
      orderId = randomUUID();
      await db.client.query('INSERT INTO categories (id,name) VALUES ($1,$2)', [
        categoryId,
        categoryId,
      ]);
      dishId = (await createDish(db.branches[0], 'Platillo base')).rows[0].id;
      await db.client.query(
        "INSERT INTO orders (id,branch_id,type,operation_id,updated_at) VALUES ($1,$2,'DINE_IN',$3,now())",
        [orderId, db.branches[0], randomUUID()],
      );
    });

    function createDish(
      branchId = db.branches[0],
      name = 'Nuevo platillo',
      price = '8.50',
      description: string | null = null,
    ) {
      return db.client.query<{
        id: string;
        name: string;
        price: string;
        description: string | null;
        branch_id: string;
      }>(
        'INSERT INTO dishes (id,branch_id,category_id,name,price,description) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id,name,price,description,branch_id',
        [randomUUID(), branchId, categoryId, name, price, description],
      );
    }
    function createLine(
      quantity = 1,
      note: string | null = null,
      price = '8.50',
    ) {
      return db.client.query<{
        id: string;
        quantity: number;
        note: string | null;
        unit_price: string;
      }>(
        "INSERT INTO order_items (id,order_id,dish_id,dish_name,quantity,unit_price,note) VALUES ($1,$2,$3,'Platillo base',$4,$5,$6) RETURNING id,quantity,note,unit_price",
        [randomUUID(), orderId, dishId, quantity, price, note],
      );
    }

    it.each([-1, 0, 21])('rechaza cantidad %i', async (quantity) => {
      await db.rejectWrite(
        () => createLine(quantity),
        '23514',
        'order_items_quantity_check',
      );
    });
    it.each([1, 20])('acepta cantidad límite %i', async (quantity) => {
      expect((await createLine(quantity)).rows[0].quantity).toBe(quantity);
    });
    it.each([null, '', 'x'.repeat(200), '😀'.repeat(200)])(
      'conserva nota válida (caso %#)',
      async (note) => {
        expect((await createLine(1, note)).rows[0].note).toBe(note);
      },
    );
    it.each(['x'.repeat(201), '😀'.repeat(201)])(
      'rechaza nota de 201 caracteres (caso %#)',
      async (note) => {
        await db.rejectWrite(() => createLine(1, note), '22001');
      },
    );
    it('rechaza actualizar cantidad o nota fuera de límites', async () => {
      const { id } = (await createLine()).rows[0];
      await db.rejectWrite(
        () =>
          db.client.query('UPDATE order_items SET quantity=21 WHERE id=$1', [
            id,
          ]),
        '23514',
        'order_items_quantity_check',
      );
      await db.rejectWrite(
        () =>
          db.client.query('UPDATE order_items SET note=$1 WHERE id=$2', [
            'x'.repeat(201),
            id,
          ]),
        '22001',
      );
    });
    it.each(['0', '-0.01'])('rechaza precio de platillo %s', async (price) => {
      await db.rejectWrite(
        () => createDish(db.branches[0], 'Precio inválido', price),
        '23514',
        'dishes_price_check',
      );
    });
    it.each(['0.01', '999999.99'])(
      'conserva precio %s sin pérdida decimal',
      async (price) => {
        expect(
          (await createDish(db.branches[0], 'Precio válido', price)).rows[0]
            .price,
        ).toBe(price);
      },
    );
    it('rechaza actualizar precio a cero', async () => {
      await db.rejectWrite(
        () =>
          db.client.query('UPDATE dishes SET price=0 WHERE id=$1', [dishId]),
        '23514',
        'dishes_price_check',
      );
    });
    it('limita ambos precios a NUMERIC(8,2)', async () => {
      expect((await createLine(1, null, '999999.99')).rows[0].unit_price).toBe(
        '999999.99',
      );
      await db.rejectWrite(
        () => createDish(db.branches[0], 'Fuera de rango', '1000000.00'),
        '22003',
      );
      await db.rejectWrite(() => createLine(1, null, '1000000.00'), '22003');
    });
    it('acepta nombre de 100 y descripción de 300 caracteres', async () => {
      const dish = (
        await createDish(
          db.branches[0],
          'x'.repeat(100),
          '1.00',
          'x'.repeat(300),
        )
      ).rows[0];
      expect(dish.name).toHaveLength(100);
      expect(dish.description).toHaveLength(300);
    });
    it('rechaza nombre de 101 y descripción de 301 caracteres', async () => {
      await db.rejectWrite(
        () => createDish(db.branches[0], 'x'.repeat(101)),
        '22001',
      );
      await db.rejectWrite(
        () =>
          createDish(
            db.branches[0],
            'Descripción larga',
            '1.00',
            'x'.repeat(301),
          ),
        '22001',
      );
    });
    it('rechaza nombre repetido por sucursal y lo permite en otra', async () => {
      await db.rejectWrite(
        () => createDish(db.branches[0], 'Platillo base'),
        '23505',
        'dishes_branch_id_name_key',
      );
      expect(
        (await createDish(db.branches[1], 'Platillo base')).rows[0].branch_id,
      ).toBe(db.branches[1]);
    });
    it('exige sucursal existente y no nula', async () => {
      await db.rejectWrite(
        () => createDish(randomUUID()),
        '23503',
        'dishes_branch_id_fkey',
      );
      await db.rejectWrite(
        () =>
          db.client.query('UPDATE dishes SET branch_id=NULL WHERE id=$1', [
            dishId,
          ]),
        '23502',
      );
    });
    it('rechaza estado de platillo fuera del enum', async () => {
      await db.rejectWrite(
        () =>
          db.client.query(
            "UPDATE dishes SET status='ESTADO_INVALIDO' WHERE id=$1",
            [dishId],
          ),
        '22P02',
      );
    });
    it.each(['AVAILABLE', 'SOLD_OUT', 'DISABLED'])(
      'acepta estado de platillo %s',
      async (status) => {
        const result = await db.client.query<{ status: string }>(
          'UPDATE dishes SET status=$1 WHERE id=$2 RETURNING status',
          [status, dishId],
        );
        expect(result.rows[0].status).toBe(status);
      },
    );
    it('acepta pedido pendiente de pago y conserva unicidad de operación', async () => {
      const result = await db.client.query<{
        status: string;
        operation_id: string;
      }>(
        "UPDATE orders SET status='PENDING_PAYMENT' WHERE id=$1 RETURNING status,operation_id",
        [orderId],
      );
      expect(result.rows[0].status).toBe('PENDING_PAYMENT');
      await db.rejectWrite(
        () =>
          db.client.query(
            "INSERT INTO orders (id,branch_id,type,operation_id,updated_at) VALUES ($1,$2,'TAKEOUT',$3,now())",
            [randomUUID(), db.branches[0], result.rows[0].operation_id],
          ),
        '23505',
        'orders_operation_id_key',
      );
    });
  },
);
