import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { Client } from 'pg';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL es obligatorio.');
const database = `e2e_fix_${randomUUID().replaceAll('-', '')}`;
const admin = new Client({ connectionString: process.env.DATABASE_URL });
let client;
let created = false;
try {
  await admin.connect();
  await admin.query(`CREATE DATABASE "${database}"`);
  created = true;
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = `/${database}`;
  client = new Client({ connectionString: url.toString() });
  await client.connect();
  const root = new URL('../prisma/migrations/', import.meta.url);
  const entries = await readdir(root, { withFileTypes: true });
  for (const name of entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()) {
    await client.query(
      await readFile(new URL(`${name}/migration.sql`, root), 'utf8'),
    );
  }
  await client.end();
  client = undefined;
  process.exitCode = await new Promise((resolve) => {
    const args = process.argv.slice(2);
    const command = args.length
      ? ['exec', '--', 'vitest', 'run', ...args]
      : ['run', 'test:e2e'];
    const child = spawn('npm', command, {
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: url.toString() },
    });
    child.on('exit', (code) => resolve(code ?? 1));
    child.on('error', () => resolve(1));
  });
} finally {
  if (client) await client.end();
  if (created) await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);
  await admin.end();
}
