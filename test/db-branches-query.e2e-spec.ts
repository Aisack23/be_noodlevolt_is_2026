import 'dotenv/config';
import { randomBytes, randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { Client } from 'pg';
import request from 'supertest';

const ids: string[] = [randomUUID(), randomUUID(), randomUUID()];

describe.sequential(
  'Consultas de sucursales contra AppModule y PostgreSQL',
  () => {
    let app: INestApplication | undefined;
    let client: Client | undefined;
    let created = false;
    beforeAll(async () => {
      process.env.JWT_SECRET ??= randomBytes(32).toString('hex');
      const { AppModule } = await import('../src/app.module.js');
      const module = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      app = module.createNestApplication();
      app.setGlobalPrefix('api/v1');
      await app.init();
      client = new Client({ connectionString: process.env.DATABASE_URL });
      await client.connect();
      await client.query('BEGIN');
      try {
        for (const [index, id] of ids.entries()) {
          await client.query(
            'INSERT INTO branches (id,name,address,is_active) VALUES ($1,$2,$3,$4)',
            [id, `${index}-${id}`, 'Test', index !== 1],
          );
          if (index !== 2)
            await client.query(
              'INSERT INTO branch_configs (id,branch_id,is_open) VALUES ($1,$2,true)',
              [randomUUID(), id],
            );
        }
        await client.query('COMMIT');
        created = true;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    });
    afterAll(async () => {
      if (app) await app.close();
      if (client) {
        try {
          if (created)
            await client.query(
              'DELETE FROM branches WHERE id=ANY($1::uuid[])',
              [ids],
            );
        } finally {
          await client.end();
        }
      }
    });
    it('lista completas las sucursales y no expone auditoría', async () => {
      const response = await request(app!.getHttpServer())
        .get('/api/v1/branches')
        .set('Authorization', 'Bearer invalid')
        .expect(200);
      const own = response.body.filter((item: { id: string }) =>
        ids.includes(item.id),
      );
      expect(own.map((item: { id: string }) => item.id)).toEqual(ids);
      expect(own.map((item: { isOpen: boolean }) => item.isOpen)).toEqual([
        true,
        false,
        false,
      ]);
      expect(Object.keys(own[0]).sort()).toEqual([
        'address',
        'id',
        'isActive',
        'isOpen',
        'name',
        'timeZone',
      ]);
    });
    it('detalle refleja el cambio de estado y mantiene config como ruta independiente', async () => {
      await client!.query(
        'UPDATE branch_configs SET is_open=false WHERE branch_id=$1',
        [ids[0]],
      );
      const detail = await request(app!.getHttpServer())
        .get(`/api/v1/branches/${ids[0]}`)
        .expect(200);
      expect(detail.body.isOpen).toBe(false);
      await request(app!.getHttpServer())
        .get(`/api/v1/branches/${ids[0]}/config`)
        .expect(200, { isOpen: false });
    });
    it('diferencia ID inválido e inexistente', async () => {
      await request(app!.getHttpServer())
        .get('/api/v1/branches/invalid')
        .expect(400);
      await request(app!.getHttpServer())
        .get(`/api/v1/branches/${randomUUID()}`)
        .expect(404);
    });
  },
);
