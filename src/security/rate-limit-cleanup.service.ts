import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '@Prisma/services';

@Injectable()
export class RateLimitCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RateLimitCleanupService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.cleanup();
    }, 60000);
    this.timer.unref();
  }

  async cleanup(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.prisma
        .$executeRaw`DELETE FROM api_rate_limits WHERE expires_at <= statement_timestamp() AND key IN (SELECT key FROM api_rate_limits WHERE expires_at <= statement_timestamp() LIMIT 10000)`;
      await this.prisma
        .$executeRaw`DELETE FROM refresh_tokens WHERE id IN (SELECT id FROM refresh_tokens WHERE expires_at <= clock_timestamp() LIMIT 10000)`;
    } catch {
      this.logger.warn(
        'No se pudieron limpiar contadores o refresh tokens vencidos.',
      );
    } finally {
      this.running = false;
    }
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
