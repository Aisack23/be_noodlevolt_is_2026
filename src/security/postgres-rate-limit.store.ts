import { createHmac } from 'node:crypto';
import type { ClientRateLimitInfo, Options, Store } from 'express-rate-limit';
import type { PrismaService } from '@Prisma/services';

export class PostgresRateLimitStore implements Store {
  readonly localKeys = false;
  private windowMs = 60000;

  constructor(
    private readonly prisma: PrismaService,
    public readonly prefix: string,
    private readonly secret: string,
  ) {}

  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    const digest = this.digest(key);
    const rows = await this.prisma.$queryRaw<
      { totalHits: number; resetTime: Date }[]
    >`
      INSERT INTO api_rate_limits (key, hits, expires_at)
      VALUES (${digest}, 1, statement_timestamp() + ${this.windowMs}::double precision * interval '1 millisecond')
      ON CONFLICT (key) DO UPDATE SET
        hits = CASE WHEN api_rate_limits.expires_at <= statement_timestamp() THEN 1 ELSE LEAST(api_rate_limits.hits, 1000000000) + 1 END,
        expires_at = CASE WHEN api_rate_limits.expires_at <= statement_timestamp()
          THEN statement_timestamp() + ${this.windowMs}::double precision * interval '1 millisecond' ELSE api_rate_limits.expires_at END
      RETURNING hits AS "totalHits", expires_at AS "resetTime"`;
    return rows[0];
  }

  async decrement(key: string): Promise<void> {
    await this.prisma
      .$executeRaw`UPDATE api_rate_limits SET hits=GREATEST(hits-1,0) WHERE key=${this.digest(key)}`;
  }

  async resetKey(key: string): Promise<void> {
    await this.prisma
      .$executeRaw`DELETE FROM api_rate_limits WHERE key=${this.digest(key)}`;
  }

  private digest(key: string): string {
    return (
      this.prefix +
      ':' +
      createHmac('sha256', this.secret)
        .update(this.prefix + ':' + key)
        .digest('hex')
    );
  }
}
