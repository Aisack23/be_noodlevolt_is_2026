import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';

@Injectable()
export class RateLimitCleanupService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async cleanup() {
    const [rateLimits, refreshTokens] = await this.prisma.$transaction([
      this.prisma.$executeRaw`
        DELETE FROM api_rate_limits
        WHERE expires_at <= statement_timestamp() AND key IN
          (SELECT key FROM api_rate_limits WHERE expires_at <= statement_timestamp() LIMIT 10000)
      `,
      this.prisma.$executeRaw`
        DELETE FROM refresh_tokens WHERE id IN
          (SELECT id FROM refresh_tokens WHERE expires_at <= statement_timestamp() LIMIT 10000)
      `,
    ]);
    return { rateLimits, refreshTokens };
  }
}
