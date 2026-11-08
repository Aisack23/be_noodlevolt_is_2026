import { BASE_BRANCHES, seedBaseData } from '../prisma/seeds/base-data.js';
import { seedCatalogData } from '../prisma/seeds/catalog-data.js';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/prisma/services/prisma.service.js';
import { NotificationRepository } from '../src/customer-features/repositories/notification.repository.js';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { seedNotificationData } from '../prisma/seeds/notification-data.js';
import { databaseFixture } from './support/database.js';
import { readFile } from 'node:fs/promises';

it('guarda los archivos DB-09 en UTF-8 sin caracteres de reemplazo', async () => {
  const paths = [
    'docs/decisiones/diagrama-er.md',
    'docs/decisiones/modelo-datos.md',
    'prisma/migrations/20261107120000_internal_notifications/migration.sql',
    'prisma/migrations/20261107120000_internal_notifications/down.sql',
    'prisma/seeds/notification-data.ts',
    'prisma/seeds/run-notifications.ts',
    'test/db-notifications.e2e-spec.ts',
    'scripts/check-migration-reversals.mjs',
    'package.json',
  ];
  for (const path of paths) {
    const content = new TextDecoder('utf-8', { fatal: true }).decode(
      await readFile(new URL(`../${path}`, import.meta.url)),
    );
    expect(content, path).not.toContain('\uFFFD');
  }
});

describe('DB-09: notificaciones internas', () => {
  const db = databaseFixture();
  let user: string;
  let order: string;
  beforeEach(async () => {
    user = randomUUID();
    order = randomUUID();
    await db.client.query(
      `INSERT INTO users(id,name,email,password_hash,updated_at) VALUES($1,'Cliente',$2,'test',now())`,
      [user, `${user}@example.com`],
    );
    await db.client.query(
      `INSERT INTO orders(id,branch_id,customer_id,type,status,operation_id,updated_at) VALUES($1,$2,$3,'DINE_IN','READY',$4,now())`,
      [order, db.branches[0], user, randomUUID()],
    );
  });
  function insert(
    userId = user,
    orderId: string | null = order,
    key: string | null = `PEDIDO_LISTO:${orderId}:${userId}`,
  ) {
    return db.client.query(
      `INSERT INTO notifications(id,user_id,order_id,event_key,type,title,message) VALUES($1,$2,$3,$4,'PEDIDO_LISTO','Listo','Pedido listo') RETURNING *`,
      [randomUUID(), userId, orderId, key],
    );
  }
  it('devuelve buzón vacío y aísla al destinatario', async () => {
    expect(
      (
        await db.client.query('SELECT * FROM notifications WHERE user_id=$1', [
          user,
        ])
      ).rows,
    ).toEqual([]);
    const row = (await insert()).rows[0];
    expect(row.order_id).toBe(order);
    expect(row.is_read).toBe(false);
    expect(row.created_at).toBeInstanceOf(Date);
    expect(
      (
        await db.client.query('SELECT * FROM notifications WHERE user_id=$1', [
          randomUUID(),
        ])
      ).rows,
    ).toEqual([]);
  });
  it('aísla dos destinatarios reales con la misma clave genérica', async () => {
    const other = randomUUID();
    await db.client.query(
      "INSERT INTO users(id,name,email,password_hash,updated_at) VALUES($1,'Otro',$2,'test',now())",
      [other, other + '@example.com'],
    );
    for (const recipient of [user, other]) {
      await db.client.query(
        "INSERT INTO notifications(id,user_id,event_key,type,title,message) VALUES($1,$2::uuid,'MISMO_EVENTO','GENERIC','Aviso',$2::text)",
        [randomUUID(), recipient],
      );
    }
    for (const recipient of [user, other]) {
      const rows = (
        await db.client.query(
          'SELECT user_id,event_key FROM notifications WHERE user_id=$1',
          [recipient],
        )
      ).rows;
      expect(rows).toEqual([{ user_id: recipient, event_key: 'MISMO_EVENTO' }]);
    }
  });
  it('rechaza reintentos incluso después de leer el aviso', async () => {
    await insert();
    await db.client.query(
      'UPDATE notifications SET is_read=true WHERE user_id=$1',
      [user],
    );
    await db.rejectWrite(
      () => insert(),
      '23505',
      'notifications_user_id_event_key_key',
    );
    expect(
      (
        await db.client.query('SELECT * FROM notifications WHERE user_id=$1', [
          user,
        ])
      ).rowCount,
    ).toBe(1);
  });
  it('rechaza una clave distinta a la identidad del evento', async () => {
    await insert();
    for (const key of [
      'OTRO_EVENTO',
      `PEDIDO_LISTO:${order}`,
      `PEDIDO_LISTO:${order}:${randomUUID()}`,
      `PEDIDO_LISTO:${randomUUID()}:${user}`,
    ]) {
      await db.rejectWrite(
        () => insert(user, order, key),
        '23514',
        'notifications_ready_event_check',
      );
    }
  });
  it('exige FK y datos del evento listo', async () => {
    await db.rejectWrite(
      () => insert(randomUUID()),
      '23503',
      'notifications_user_id_fkey',
    );
    await db.rejectWrite(
      () => insert(user, randomUUID()),
      '23503',
      'notifications_order_id_fkey',
    );
    await db.rejectWrite(
      () => insert(user, null),
      '23514',
      'notifications_ready_event_check',
    );
    await db.rejectWrite(
      () => insert(user, order, null),
      '23514',
      'notifications_ready_event_check',
    );
    await db.rejectWrite(
      () => insert(user, order, '  '),
      '23514',
      'notifications_ready_event_check',
    );
  });
  it('restringe borrar el pedido y elimina avisos al borrar destinatario', async () => {
    await insert();
    await db.rejectWrite(
      () => db.client.query('DELETE FROM orders WHERE id=$1', [order]),
      '23001',
      'notifications_order_id_fkey',
    );
    await db.client.query('DELETE FROM users WHERE id=$1', [user]);
    expect(
      (
        await db.client.query('SELECT * FROM notifications WHERE user_id=$1', [
          user,
        ])
      ).rowCount,
    ).toBe(0);
  });
});

describe('DB-09: seed idempotente', () => {
  it('conserva un aviso por pedido, sus líneas e IDs al ejecutar dos veces', async () => {
    const prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    });
    try {
      await seedBaseData(prisma);
      await seedCatalogData(prisma);
      const usersBefore = await prisma.user.count();
      const branchesBefore = await prisma.branch.count();
      await seedNotificationData(prisma);
      const before = await prisma.notification.findMany({
        where: {
          user: { email: 'demo@example.com' },
          type: 'PEDIDO_LISTO',
          order: { orderNumber: 'DB09-READY' },
        },
        orderBy: { id: 'asc' },
      });
      const ordersBefore = await prisma.order.findMany({
        where: { orderNumber: 'DB09-READY' },
        include: { items: true },
        orderBy: { id: 'asc' },
      });
      await seedNotificationData(prisma);
      expect(
        await prisma.notification.findMany({
          where: {
            user: { email: 'demo@example.com' },
            type: 'PEDIDO_LISTO',
            order: { orderNumber: 'DB09-READY' },
          },
          orderBy: { id: 'asc' },
        }),
      ).toEqual(before);
      expect(before).toHaveLength(BASE_BRANCHES.length);
      expect(await prisma.user.count()).toBe(usersBefore);
      expect(await prisma.branch.count()).toBe(branchesBefore);
      const orders = await prisma.order.findMany({
        where: { orderNumber: 'DB09-READY' },
        include: { items: true },
        orderBy: { id: 'asc' },
      });
      expect(orders).toEqual(ordersBefore);
      expect(orders).toHaveLength(BASE_BRANCHES.length);
      for (const order of orders) {
        expect(order.status).toBe('READY');
        expect(order.items).toHaveLength(1);
        expect(order.total?.toFixed(2)).toBe(
          order.items[0]!.unitPrice.mul(order.items[0]!.quantity).toFixed(2),
        );
        expect(before.find((row) => row.orderId === order.id)?.eventKey).toBe(
          'PEDIDO_LISTO:' + order.id + ':' + order.customerId,
        );
      }
    } finally {
      await prisma.$disconnect();
    }
  });
});

describe('NotificationRepository: compatibilidad DB-09', () => {
  it('crea avisos genéricos, lista por usuario y marca leídos', async () => {
    const prisma = new PrismaService(
      new ConfigService({
        DATABASE_URL: process.env.DATABASE_URL,
        NODE_ENV: 'test',
      }),
    );
    const repository = new NotificationRepository(prisma);
    const id = randomUUID();
    try {
      await prisma.user.create({
        data: {
          id,
          email: `${id}@example.com`,
          name: 'Compatibilidad',
          passwordHash: '!disabled',
        },
      });
      expect(await repository.findByUser(id)).toEqual([]);
      const notification = await repository.create({
        userId: id,
        type: 'GENERIC',
        title: 'Prueba',
        message: 'Compatibilidad',
      });
      expect(notification.orderId).toBeNull();
      expect(await repository.countUnreadByUser(id)).toBe(1);
      expect((await repository.findByUser(id)).map((row) => row.id)).toEqual([
        notification.id,
      ]);
      await repository.markAsRead(notification.id);
      expect(await repository.findUnreadByUser(id)).toEqual([]);
    } finally {
      await prisma.user.deleteMany({ where: { id } });
      await prisma.$disconnect();
    }
  });
});
