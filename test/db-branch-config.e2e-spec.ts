import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { Client } from 'pg';
import { BASE_BRANCHES, seedBaseData } from '../prisma/seeds/base-data.js';
import { seedBranchConfigData } from '../prisma/seeds/branch-config-data.js';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { databaseFixture } from './support/database.js';

describe.sequential('DB-11: estado operativo de sucursal', () => {
  const db = databaseFixture();

  function createConfig(branchId = db.branches[0]) {
    return db.client.query<{
      id: string;
      is_open: boolean;
      updated_by: string | null;
      created_at: Date;
      updated_at: Date;
    }>(
      'INSERT INTO branch_configs (id,branch_id) VALUES ($1,$2) RETURNING id,is_open,updated_by,created_at,updated_at',
      [randomUUID(), branchId],
    );
  }
  async function createManager(branchId = db.branches[0]) {
    const id = randomUUID();
    await db.client.query(
      `INSERT INTO users (id,email,name,last_name,password_hash,role,branch_id,updated_at)
         VALUES ($1,$2,'Gerente','Prueba','test','BRANCH_ADMIN',$3,now())`,
      [id, `${id}@example.com`, branchId],
    );
    return id;
  }

  it('crea la sucursal abierta, sin autor y con fechas de auditoría', async () => {
    const config = (await createConfig()).rows[0];
    expect(config.is_open).toBe(true);
    expect(config.updated_by).toBeNull();
    expect(config.created_at).toBeInstanceOf(Date);
    expect(config.updated_at).toBeInstanceOf(Date);
  });
  it('guarda el estado CERRADA y quién lo cambió', async () => {
    const { id } = (await createConfig()).rows[0];
    const managerId = await createManager();
    const result = await db.client.query<{
      is_open: boolean;
      updated_by: string;
    }>(
      'UPDATE branch_configs SET is_open=false, updated_by=$1 WHERE id=$2 RETURNING is_open,updated_by',
      [managerId, id],
    );
    expect(result.rows[0]).toEqual({ is_open: false, updated_by: managerId });
  });
  it('permite una sola configuración por sucursal', async () => {
    await createConfig();
    await db.rejectWrite(
      () => createConfig(),
      '23505',
      'branch_configs_branch_id_key',
    );
    expect((await createConfig(db.branches[1])).rows).toHaveLength(1);
  });
  it('exige una sucursal existente y no nula', async () => {
    await db.rejectWrite(
      () => createConfig(randomUUID()),
      '23503',
      'branch_configs_branch_id_fkey',
    );
    await db.rejectWrite(
      () =>
        db.client.query(
          'INSERT INTO branch_configs (id,branch_id) VALUES ($1,NULL)',
          [randomUUID()],
        ),
      '23502',
    );
  });
  it('rechaza un estado nulo', async () => {
    const { id } = (await createConfig()).rows[0];
    await db.rejectWrite(
      () =>
        db.client.query('UPDATE branch_configs SET is_open=NULL WHERE id=$1', [
          id,
        ]),
      '23502',
    );
  });
  it('exige que el autor del cambio sea un usuario existente', async () => {
    const { id } = (await createConfig()).rows[0];
    await db.rejectWrite(
      () =>
        db.client.query('UPDATE branch_configs SET updated_by=$1 WHERE id=$2', [
          randomUUID(),
          id,
        ]),
      '23503',
      'branch_configs_updated_by_fkey',
    );
  });
  it('conserva el estado si se elimina el usuario que lo cambió', async () => {
    const { id } = (await createConfig()).rows[0];
    const managerId = await createManager();
    await db.client.query(
      'UPDATE branch_configs SET is_open=false, updated_by=$1 WHERE id=$2',
      [managerId, id],
    );
    await db.client.query('DELETE FROM users WHERE id=$1', [managerId]);
    const { rows } = await db.client.query<{
      is_open: boolean;
      updated_by: string | null;
    }>('SELECT is_open,updated_by FROM branch_configs WHERE id=$1', [id]);
    expect(rows[0]).toEqual({ is_open: false, updated_by: null });
  });
  it('elimina la configuración junto con su sucursal', async () => {
    const { id } = (await createConfig()).rows[0];
    await db.client.query('DELETE FROM branches WHERE id=$1', [db.branches[0]]);
    const { rows } = await db.client.query(
      'SELECT id FROM branch_configs WHERE id=$1',
      [id],
    );
    expect(rows).toHaveLength(0);
  });
  it('guarda las fechas con zona horaria', async () => {
    const { rows } = await db.client.query<{ data_type: string }>(
      `SELECT data_type FROM information_schema.columns
         WHERE table_schema='public' AND table_name='branch_configs'
           AND column_name IN ('created_at','updated_at')`,
    );
    expect(rows).toEqual([
      { data_type: 'timestamp with time zone' },
      { data_type: 'timestamp with time zone' },
    ]);
  });
});

// El seed confirma sus escrituras con su propia conexión, por lo que no puede
// correr dentro de la transacción con rollback de databaseFixture.
describe.sequential('DB-11: seed y auditoría del estado de sucursal', () => {
  const SEED_TIMEOUT_MS = 30_000;
  const branchNames = BASE_BRANCHES.map(({ name }) => name);
  let client: Client;
  let prisma: PrismaClient;

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    });
    await seedBaseData(prisma);
    await seedBranchConfigData(prisma);
  }, SEED_TIMEOUT_MS);

  afterAll(async () => {
    await prisma.$disconnect();
    await client.end();
  });

  async function configSnapshot() {
    const { rows } = await client.query<{
      id: string;
      branch_id: string;
      is_open: boolean;
      updated_by: string | null;
      created_at: Date;
      updated_at: Date;
    }>(
      `SELECT c.id, c.branch_id, c.is_open, c.updated_by, c.created_at, c.updated_at
         FROM branch_configs c JOIN branches b ON b.id = c.branch_id
         WHERE b.name = ANY($1) ORDER BY b.name`,
      [branchNames],
    );
    return rows;
  }
  async function withRestoredConfigs(test: () => Promise<void>) {
    const original = await configSnapshot();
    try {
      await test();
    } finally {
      for (const row of original)
        await client.query(
          'UPDATE branch_configs SET is_open=$1, updated_by=$2, updated_at=$3 WHERE id=$4',
          [row.is_open, row.updated_by, row.updated_at, row.id],
        );
    }
  }

  it(
    'crea una configuración por sucursal y no cambia nada al repetirse',
    async () => {
      const before = await configSnapshot();
      await seedBranchConfigData(prisma);

      expect(before).toHaveLength(branchNames.length);
      expect(await configSnapshot()).toEqual(before);
    },
    SEED_TIMEOUT_MS,
  );

  it(
    'conserva un estado modificado después del primer seed',
    async () => {
      await withRestoredConfigs(async () => {
        const [config] = await configSnapshot();
        await client.query(
          'UPDATE branch_configs SET is_open=NOT is_open WHERE id=$1',
          [config.id],
        );
        const modified = await configSnapshot();

        await seedBranchConfigData(prisma);

        expect(await configSnapshot()).toEqual(modified);
      });
    },
    SEED_TIMEOUT_MS,
  );

  it(
    'registra autor y fecha al cambiar el estado desde Prisma',
    async () => {
      await withRestoredConfigs(async () => {
        const [config] = await configSnapshot();
        const manager = await prisma.user.findUniqueOrThrow({
          where: { email: 'branch_admin@example.com' },
        });
        await client.query(
          "UPDATE branch_configs SET updated_at = updated_at - interval '1 hour' WHERE id=$1",
          [config.id],
        );
        const previous = await prisma.branchConfig.findUniqueOrThrow({
          where: { id: config.id },
        });

        const updated = await prisma.branchConfig.update({
          where: { id: config.id },
          data: { isOpen: !config.is_open, updatedBy: manager.id },
        });

        expect(updated.isOpen).toBe(!config.is_open);
        expect(updated.updatedBy).toBe(manager.id);
        expect(updated.updatedAt.getTime()).toBeGreaterThan(
          previous.updatedAt.getTime(),
        );
      });
    },
    SEED_TIMEOUT_MS,
  );
});
