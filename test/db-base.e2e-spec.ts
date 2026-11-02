import { randomUUID } from 'node:crypto';
import { databaseFixture } from './support/database.js';

describe.sequential(
  'DB-A.1.1: restricciones de usuarios, sucursales y mesas',
  () => {
    const db = databaseFixture();

    function createUser(
      role: string,
      branchId: string | null,
      email = `${randomUUID()}@example.com`,
    ) {
      return db.client.query<{
        id: string;
        role: string;
        branch_id: string | null;
      }>(
        `INSERT INTO users (id,email,name,last_name,password_hash,role,branch_id,updated_at)
       VALUES ($1,$2,'Prueba','Local','test',$3,$4,now()) RETURNING id,role,branch_id`,
        [randomUUID(), email, role, branchId],
      );
    }
    function createTable(capacity: number, branchId = db.branches[0]) {
      return db.client.query<{ id: string; capacity: number }>(
        'INSERT INTO tables (id,branch_id,number,capacity) VALUES ($1,$2,$3,$4) RETURNING id,capacity',
        [randomUUID(), branchId, 'T1', capacity],
      );
    }

    it.each(['WAITER', 'COOK', 'CASHIER', 'INVENTORY_MANAGER', 'BRANCH_ADMIN'])(
      'exige sucursal al personal %s',
      async (role) => {
        await db.rejectWrite(
          () => createUser(role, null),
          '23514',
          'users_role_branch_check',
        );
        expect((await createUser(role, db.branches[0])).rows[0].branch_id).toBe(
          db.branches[0],
        );
      },
    );
    it.each(['CLIENT', 'GENERAL_MANAGER'])(
      'exige sucursal nula para %s',
      async (role) => {
        await db.rejectWrite(
          () => createUser(role, db.branches[0]),
          '23514',
          'users_role_branch_check',
        );
        expect((await createUser(role, null)).rows[0].branch_id).toBeNull();
      },
    );
    it('rechaza un rol fuera del enum', async () => {
      await db.rejectWrite(() => createUser('ROL_INVALIDO', null), '22P02');
    });
    it('rechaza correo duplicado', async () => {
      const email = `${randomUUID()}@example.com`;
      await createUser('CLIENT', null, email);
      await db.rejectWrite(
        () => createUser('CLIENT', null, email),
        '23505',
        'users_email_key',
      );
    });
    it('rechaza sucursal inexistente del personal', async () => {
      await db.rejectWrite(
        () => createUser('WAITER', randomUUID()),
        '23503',
        'users_branch_id_fkey',
      );
    });
    it('valida cambios de rol y sucursal juntos', async () => {
      const { id } = (await createUser('WAITER', db.branches[0])).rows[0];
      await db.rejectWrite(
        () =>
          db.client.query('UPDATE users SET branch_id=NULL WHERE id=$1', [id]),
        '23514',
        'users_role_branch_check',
      );
      await db.rejectWrite(
        () =>
          db.client.query("UPDATE users SET role='CLIENT' WHERE id=$1", [id]),
        '23514',
        'users_role_branch_check',
      );
      await db.client.query(
        "UPDATE users SET role='CLIENT',branch_id=NULL WHERE id=$1",
        [id],
      );
      await db.rejectWrite(
        () =>
          db.client.query("UPDATE users SET role='WAITER' WHERE id=$1", [id]),
        '23514',
        'users_role_branch_check',
      );
    });
    it('rechaza nombres de sucursal duplicados', async () => {
      await db.rejectWrite(
        () =>
          db.client.query(
            'INSERT INTO branches (id,name,address) VALUES ($1,$2,$3)',
            [randomUUID(), db.branches[0], 'Otra dirección'],
          ),
        '23505',
        'branches_name_key',
      );
    });
    it.each([-1, 0])('rechaza capacidad %i', async (capacity) => {
      await db.rejectWrite(
        () => createTable(capacity),
        '23514',
        'tables_capacity_check',
      );
    });
    it('acepta capacidad 1 y rechaza actualizarla a 0', async () => {
      const { id, capacity } = (await createTable(1)).rows[0];
      expect(capacity).toBe(1);
      await db.rejectWrite(
        () => db.client.query('UPDATE tables SET capacity=0 WHERE id=$1', [id]),
        '23514',
        'tables_capacity_check',
      );
    });
    it('rechaza repetir número de mesa en la sucursal y lo permite en otra', async () => {
      await createTable(4);
      await db.rejectWrite(
        () => createTable(4),
        '23505',
        'tables_branch_id_number_key',
      );
      expect((await createTable(4, db.branches[1])).rowCount).toBe(1);
    });
    it('acepta el estado de mesa por limpiar', async () => {
      const { id } = (await createTable(4)).rows[0];
      const result = await db.client.query<{ status: string }>(
        "UPDATE tables SET status='NEEDS_CLEANING' WHERE id=$1 RETURNING status",
        [id],
      );
      expect(result.rows[0].status).toBe('NEEDS_CLEANING');
    });
  },
);
