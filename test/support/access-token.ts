import { randomBytes, randomUUID } from 'node:crypto';
import type { JwtService } from '@nestjs/jwt';
import type { Client } from 'pg';

export async function accessTokenFor(
  db: Client,
  jwt: JwtService,
  userId: string,
  claims: Record<string, unknown> = {},
) {
  const sid = randomUUID();
  await db.query(
    `INSERT INTO refresh_tokens (id, token_hash, user_id, expires_at) VALUES ($1, $2, $3, NOW() + interval '1 day')`,
    [sid, randomBytes(32).toString('hex'), userId],
  );
  return jwt.signAsync({ ...claims, sub: userId, sid });
}
