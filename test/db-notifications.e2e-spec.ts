import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/prisma/services/prisma.service.js';
import { NotificationRepository } from '../src/customer-features/repositories/notification.repository.js';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { seedNotificationData } from '../prisma/seeds/notification-data.js';
import { databaseFixture } from './support/database.js';

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
    key: string | null = `PEDIDO_LISTO:${order}`,
  ) {
    return db.client.query(
      `INSERT INTO notifications(id,user_id,order_id,event_key,type,title,message) VALUES($1,$2,$3,$4,'PEDIDO_LISTO','Listo','Pedido listo') RETURNING *`,
      [randomUUID(), userId, orderId, key],
    );
  }
  it('devuelve buz�n vac�o y a�sla al destinatario', async () => {
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
  it('rechaza reintentos incluso despu�s de leer el aviso', async () => {
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
  it('permite distintos eventos para el mismo cliente', async () => {
    await insert();
    await insert(user, order, 'OTRO_EVENTO');
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
  it('conserva una sola notificaci�n y sus IDs al ejecutar dos veces', async () => {
    const prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    });
    try {
      await seedNotificationData(prisma);
      const before = await prisma.notification.findMany({
        where: { user: { email: 'db09@example.com' } },
      });
      await seedNotificationData(prisma);
      expect(
        await prisma.notification.findMany({
          where: { user: { email: 'db09@example.com' } },
        }),
      ).toEqual(before);
      expect(before).toHaveLength(1);
    } finally {
      await prisma.$disconnect();
    }
  });
});

describe('NotificationRepository: compatibilidad DB-09', () => {
  it('crea avisos gen�ricos, lista por usuario y marca le�dos', async () => {
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
