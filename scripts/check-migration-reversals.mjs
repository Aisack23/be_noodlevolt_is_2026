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

const CATEGORY_COPY_MIGRATION = 'categorias_platillos_sucursal';
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

async function categoryCopyFixtures() {
  const branches = [randomUUID(), randomUUID()];
  const categories = { used: randomUUID(), unused: randomUUID() };
  const dishes = [
    {
      id: randomUUID(),
      branch: branches[0],
      status: 'AVAILABLE',
      price: '8.50',
      description: 'Con pollo y vegetales',
      createdAt: '2026-01-15T10:00:00.000Z',
    },
    {
      id: randomUUID(),
      branch: branches[0],
      status: 'SOLD_OUT',
      price: '999999.99',
      description: null,
      createdAt: '2026-02-20T18:30:00.000Z',
    },
    {
      id: randomUUID(),
      branch: branches[1],
      status: 'DISABLED',
      price: '0.01',
      description: 'Solo en temporada',
      createdAt: '2026-03-25T23:59:59.000Z',
    },
  ];
  for (const id of branches)
    await client.query(
      'INSERT INTO branches (id,name,address) VALUES ($1,$2,$3)',
      [id, id, 'Prueba aislada'],
    );
  await client.query(
    `INSERT INTO categories (id,name,display_order,is_active,description)
       VALUES ($1,$2,3,false,'Platos con fideos'),($3,$4,0,true,NULL)`,
    [categories.used, 'Usada', categories.unused, 'Sin platillos'],
  );
  for (const dish of dishes)
    await client.query(
      `INSERT INTO dishes (id,branch_id,category_id,name,price,status,description,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        dish.id,
        dish.branch,
        categories.used,
        dish.id,
        dish.price,
        dish.status,
        dish.description,
        dish.createdAt,
      ],
    );
  return { branches, dishes, dishesBefore: await preservedDishRows() };
}

async function preservedDishRows() {
  const { rows } = await client.query(
    `SELECT id, branch_id, name, description, price, image_url, status, created_at
       FROM dishes ORDER BY id`,
  );
  return rows;
}

async function checkCategoryCopy({ branches, dishes, dishesBefore }) {
  const copies = await client.query(
    `SELECT branch_id, name, display_order, is_active, description FROM categories
       ORDER BY branch_id, name`,
  );
  assert.deepEqual(
    copies.rows,
    [...branches].sort().flatMap((branch_id) => [
      {
        branch_id,
        name: 'Sin platillos',
        display_order: 0,
        is_active: true,
        description: null,
      },
      {
        branch_id,
        name: 'Usada',
        display_order: 3,
        is_active: false,
        description: 'Platos con fideos',
      },
    ]),
    'Cada categoría debe copiarse a cada sucursal con sus datos',
  );
  const dishesAfter = await preservedDishRows();
  assert.deepEqual(
    dishesAfter.map(({ id }) => id),
    dishes.map(({ id }) => id).sort(),
    'La migración debe conservar exactamente los mismos ID de platillos',
  );
  assert.deepEqual(
    dishesAfter,
    dishesBefore,
    'La migración debe conservar precio, descripción y created_at de los platillos',
  );
  for (const { id, price, description, createdAt } of dishes) {
    const row = dishesAfter.find((dish) => dish.id === id);
    assert.equal(row.price, price);
    assert.equal(row.description, description);
    assert.equal(row.created_at.toISOString(), createdAt);
  }
  const expected = {
    AVAILABLE: true,
    SOLD_OUT: false,
    DISABLED: false,
  };
  for (const { id, branch, status } of dishes) {
    const { rows } = await client.query(
      `SELECT d.status, d.is_available, d.is_deleted, c.branch_id, c.name
         FROM dishes d JOIN categories c ON c.id = d.category_id
         WHERE d.id = $1`,
      [id],
    );
    assert.deepEqual(
      rows[0],
      {
        status,
        is_available: expected[status],
        is_deleted: false,
        branch_id: branch,
        name: 'Usada',
      },
      `El platillo ${status} debe quedar en la copia de su sucursal`,
    );
  }
  await client.query('DELETE FROM dishes');
  await client.query('DELETE FROM categories');
  await client.query('DELETE FROM branches WHERE id=ANY($1::uuid[])', [
    branches,
  ]);
}

async function checkCategoryWithoutBranch(up) {
  const id = randomUUID();
  await client.query('INSERT INTO categories (id,name) VALUES ($1,$2)', [
    id,
    id,
  ]);
  const before = await schema();
  await assert.rejects(client.query(up), { code: 'P0001' });
  assert.deepEqual(
    await schema(),
    before,
    'Sin sucursales la migración no debe aplicar cambios parciales',
  );
  await client.query('DELETE FROM categories WHERE id=$1', [id]);
}

async function checkOrderUpdatedByRefusal(down) {
  const fixture = await notificationFixtures();
  await client.query('UPDATE orders SET updated_by=$1 WHERE id=$2', [
    fixture.user,
    fixture.order,
  ]);
  const before = await schema();
  const rows = (
    await client.query('SELECT * FROM orders WHERE id=$1', [fixture.order])
  ).rows;
  await assert.rejects(client.query(down), { code: 'P0001' });
  await client.query('ROLLBACK');
  assert.deepEqual(
    await schema(),
    before,
    'El rechazo debe conservar el esquema DB-03',
  );
  assert.deepEqual(
    (await client.query('SELECT * FROM orders WHERE id=$1', [fixture.order]))
      .rows,
    rows,
    'El rechazo debe conservar el autor de la transición',
  );
  await removeNotificationFixtures(fixture);
}

async function checkRefusal(directory, down) {
  if (
    directory.endsWith('dining_rooms') ||
    directory.endsWith('loyalty_rewards')
  ) {
    await checkExtraEndpointRefusal(directory, down);
    return;
  }
  if (directory.endsWith('order_updated_by')) {
    await checkOrderUpdatedByRefusal(down);
    return;
  }
  if (directory.endsWith('internal_notifications')) {
    await checkNotificationRefusal(down);
    return;
  }
  const enums = directory.endsWith('base_anexo_a');
  const branchColumn = directory.endsWith('catalogo_pedidos_hu');
  const categoryBranch = directory.endsWith(CATEGORY_COPY_MIGRATION);
  if (!enums && !branchColumn && !categoryBranch) return;
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
  } else if (categoryBranch) {
    await client.query(
      'INSERT INTO categories (id,branch_id,name) VALUES ($1,$2,$3)',
      [record, branch, record],
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
  const table = enums ? 'users' : categoryBranch ? 'categories' : 'dishes';
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

async function checkExtraEndpointRefusal(directory, down) {
  const id = randomUUID();
  const branch = randomUUID();
  const room = directory.endsWith('dining_rooms');
  if (room) {
    await client.query(
      "INSERT INTO branches(id,name,address) VALUES($1::uuid,$1::text,'HU03')",
      [branch],
    );
    await client.query(
      "INSERT INTO dining_rooms(id,branch_id,name) VALUES($1,$2,'Terraza personalizada')",
      [id, branch],
    );
  } else {
    await client.query(
      "INSERT INTO benefits(id,name,points_cost,reward_type,product_name) VALUES($1,'Personalizado',25,'PRODUCT','Wantanes')",
      [id],
    );
  }
  const before = await schema();
  await assert.rejects(client.query(down), { code: 'P0001' });
  await client.query('ROLLBACK');
  assert.deepEqual(
    await schema(),
    before,
    'El down rechazado debe conservar el esquema completo',
  );
  const table = room ? 'dining_rooms' : 'benefits';
  const result = await client.query(
    `DELETE FROM ${table} WHERE id=$1 RETURNING id`,
    [id],
  );
  assert.equal(
    result.rowCount,
    1,
    'La reversión rechazada debe conservar los datos personalizados',
  );
  if (room) await client.query('DELETE FROM branches WHERE id=$1', [branch]);
  else {
    const initial = '73000000-0000-4000-8000-000000000001';
    const previous = (
      await client.query('SELECT description FROM benefits WHERE id=$1', [
        initial,
      ])
    ).rows[0].description;
    await client.query(
      "UPDATE benefits SET description='Personalizada' WHERE id=$1",
      [initial],
    );
    await assert.rejects(client.query(down), { code: 'P0001' });
    await client.query('ROLLBACK');
    assert.equal(
      (
        await client.query('SELECT description FROM benefits WHERE id=$1', [
          initial,
        ])
      ).rows[0].description,
      'Personalizada',
    );
    await client.query('UPDATE benefits SET description=$1 WHERE id=$2', [
      previous,
      initial,
    ]);
  }
}

async function checkDiningRoomBackfill(up) {
  const branches = [randomUUID(), randomUUID()];
  const tables = [randomUUID(), randomUUID()];
  for (const [i, branch] of branches.entries()) {
    await client.query(
      "INSERT INTO branches(id,name,address) VALUES($1::uuid,$1::text,'HU03')",
      [branch],
    );
    await client.query(
      "INSERT INTO tables(id,branch_id,number,capacity,status) VALUES($1,$2,'1',4,'OCCUPIED')",
      [tables[i], branch],
    );
  }
  await client.query(up);
  const { rows } = await client.query(
    `SELECT t.id,t.branch_id,t.status,r.branch_id AS room_branch,r.name
    FROM tables t JOIN dining_rooms r ON r.id=t.room_id WHERE t.id=ANY($1::uuid[]) ORDER BY t.id`,
    [tables],
  );
  assert.equal(rows.length, 2);
  for (const row of rows) {
    assert.equal(row.branch_id, row.room_branch);
    assert.equal(row.status, 'OCCUPIED');
    assert.equal(row.name, 'Salón principal');
  }
  const other = (
    await client.query('SELECT id FROM dining_rooms WHERE branch_id=$1', [
      branches[1],
    ])
  ).rows[0].id;
  await assert.rejects(
    client.query('UPDATE tables SET room_id=$1 WHERE id=$2', [
      other,
      tables[0],
    ]),
    { code: '23503' },
  );
  await client.query('DELETE FROM tables WHERE id=ANY($1::uuid[])', [tables]);
  await client.query('DELETE FROM branches WHERE id=ANY($1::uuid[])', [
    branches,
  ]);
}

async function checkLegacyBenefitPreservation(up) {
  const benefit = randomUUID();
  const redemption = randomUUID();
  const user = randomUUID();
  await client.query(
    "INSERT INTO users(id,name,email,password_hash,updated_at) VALUES($1,'HU03',$2,'unused',now())",
    [user, `${user}@example.com`],
  );
  await client.query(
    "INSERT INTO benefits(id,name,points_cost,discount) VALUES($1,'Beneficio anterior',25,2)",
    [benefit],
  );
  await client.query(
    'INSERT INTO redemptions(id,customer_id,benefit_id,code,points_cost) VALUES($1,$2,$3,$4,25)',
    [redemption, user, benefit, randomUUID()],
  );
  await client.query(up);
  const row = (
    await client.query(
      'SELECT reward_type,points_cost,status FROM redemptions WHERE id=$1',
      [redemption],
    )
  ).rows[0];
  assert.deepEqual(row, {
    reward_type: null,
    points_cost: 25,
    status: 'PENDING',
  });
  const old = (
    await client.query(
      'SELECT reward_type,discount FROM benefits WHERE id=$1',
      [benefit],
    )
  ).rows[0];
  assert.deepEqual(old, { reward_type: null, discount: '2.00' });
  await client.query('DELETE FROM redemptions WHERE id=$1', [redemption]);
  await client.query('DELETE FROM benefits WHERE id=$1', [benefit]);
  await client.query('DELETE FROM users WHERE id=$1', [user]);
}

async function notificationFixtures() {
  const branch = randomUUID();
  const user = randomUUID();
  const order = randomUUID();
  await client.query(
    "INSERT INTO branches(id,name,address) VALUES($1::uuid,$1::text,'Prueba')",
    [branch],
  );
  await client.query(
    "INSERT INTO users(id,name,email,password_hash,updated_at) VALUES($1,'Cliente',$2,'test',now())",
    [user, `${user}@example.com`],
  );
  await client.query(
    "INSERT INTO orders(id,branch_id,customer_id,type,status,operation_id,updated_at) VALUES($1,$2,$3,'DINE_IN','READY',$4,now())",
    [order, branch, user, randomUUID()],
  );
  return { branch, user, order };
}

async function removeNotificationFixtures({ branch, user, order }) {
  await client.query('DELETE FROM notifications WHERE user_id=$1', [user]);
  await client.query('DELETE FROM orders WHERE id=$1', [order]);
  await client.query('DELETE FROM users WHERE id=$1', [user]);
  await client.query('DELETE FROM branches WHERE id=$1', [branch]);
}

async function checkNotificationRefusal(down) {
  const fixture = await notificationFixtures();
  const id = randomUUID();
  await client.query(
    "INSERT INTO notifications(id,user_id,order_id,type,event_key,title,message) VALUES($1,$2,$3,'PEDIDO_LISTO',$4,'Listo','Pedido listo')",
    [
      id,
      fixture.user,
      fixture.order,
      `PEDIDO_LISTO:${fixture.order}:${fixture.user}`,
    ],
  );
  const before = await schema();
  const rows = (
    await client.query('SELECT * FROM notifications WHERE id=$1', [id])
  ).rows;
  await assert.rejects(client.query(down), { code: 'P0001' });
  await client.query('ROLLBACK');
  assert.deepEqual(
    await schema(),
    before,
    'El down rechazado debe conservar todo el esquema',
  );
  assert.deepEqual(
    (await client.query('SELECT * FROM notifications WHERE id=$1', [id])).rows,
    rows,
    'El down rechazado debe conservar el aviso y su pedido',
  );
  await removeNotificationFixtures(fixture);
}

async function checkNotificationMigrationRefusal(up) {
  for (const duplicate of [true, false]) {
    const fixture = await notificationFixtures();
    const ids = duplicate ? [randomUUID(), randomUUID()] : [randomUUID()];
    for (const id of ids) {
      await client.query(
        "INSERT INTO notifications(id,user_id,event_key,type,title,message) VALUES($1,$2,'LEGACY_EVENT',$3,'Aviso','Datos anteriores')",
        [id, fixture.user, duplicate ? 'GENERIC' : 'PEDIDO_LISTO'],
      );
    }
    const before = await schema();
    const rows = (
      await client.query(
        'SELECT * FROM notifications WHERE user_id=$1 ORDER BY id',
        [fixture.user],
      )
    ).rows;
    await assert.rejects(client.query(up), {
      code: duplicate ? '23505' : '23514',
    });
    await client.query('ROLLBACK');
    assert.deepEqual(
      await schema(),
      before,
      'La migración rechazada no debe dejar columnas, índices ni restricciones parciales',
    );
    assert.deepEqual(
      (
        await client.query(
          'SELECT * FROM notifications WHERE user_id=$1 ORDER BY id',
          [fixture.user],
        )
      ).rows,
      rows,
      'La migración rechazada debe conservar todos los avisos anteriores',
    );
    await removeNotificationFixtures(fixture);
  }
}

async function checkBranchConfigCopy(owned) {
  const migration = owned.find(({ directory }) =>
    directory.endsWith('parametros_sucursal'),
  );
  if (!migration) return;
  const before = await schema();
  const branches = [randomUUID(), randomUUID()];
  for (const id of branches)
    await client.query(
      'INSERT INTO branches (id,name,address) VALUES ($1,$2,$3)',
      [id, id, 'Prueba aislada'],
    );
  await client.query(migration.down);
  await client.query(migration.up);
  const { rows } = await client.query(
    'SELECT branch_id, is_open, updated_by FROM branch_configs ORDER BY branch_id',
  );
  assert.deepEqual(
    rows,
    [...branches]
      .sort()
      .map((branch_id) => ({ branch_id, is_open: true, updated_by: null })),
    'Cada sucursal existente debe quedar abierta y sin autor de cambio',
  );
  assert.deepEqual(
    await schema(),
    before,
    'La copia de sucursales no debe alterar el schema',
  );
  await client.query('DELETE FROM branches WHERE id=ANY($1::uuid[])', [
    branches,
  ]);
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
    if (directory.endsWith('internal_notifications')) {
      await checkNotificationMigrationRefusal(up);
    }
    if (directory.endsWith('dining_rooms')) {
      await checkDiningRoomBackfill(up);
    } else if (directory.endsWith('loyalty_rewards')) {
      await checkLegacyBenefitPreservation(up);
    } else if (directory.endsWith(CATEGORY_COPY_MIGRATION)) {
      await checkCategoryWithoutBranch(up);
      const fixtures = await categoryCopyFixtures();
      await client.query(up);
      await checkCategoryCopy(fixtures);
    } else {
      await client.query(up);
    }
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
  await checkBranchConfigCopy(owned);

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
