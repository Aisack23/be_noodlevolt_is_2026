import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';

export function databaseFixture() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  let branches: string[];
  beforeAll(async () => {
    if (!process.env.DATABASE_URL)
      throw new Error(
        'Configurar DATABASE_URL y aplicar las migraciones en PostgreSQL de Docker.',
      );
    await client.connect();
  });
  afterAll(async () => {
    await client.end();
  });
  beforeEach(async () => {
    await client.query('BEGIN');
    branches = [randomUUID(), randomUUID()];
    for (const id of branches) {
      await client.query(
        'INSERT INTO branches (id,name,address) VALUES ($1,$2,$3)',
        [id, id, 'Prueba'],
      );
    }
  });
  afterEach(async () => {
    await client.query('ROLLBACK');
  });

  async function rejectWrite(
    write: () => Promise<unknown>,
    code: string,
    constraint?: string,
  ) {
    await client.query('SAVEPOINT invalid_write');
    try {
      await expect(write()).rejects.toMatchObject({ code, constraint });
    } finally {
      await client.query('ROLLBACK TO SAVEPOINT invalid_write');
      await client.query('RELEASE SAVEPOINT invalid_write');
    }
  }
  return {
    client,
    rejectWrite,
    get branches() {
      return branches;
    },
  };
}
