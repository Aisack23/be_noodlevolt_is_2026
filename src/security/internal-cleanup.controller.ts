import { Controller, Get, Header, Headers, Inject, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'node:crypto';
import { Public } from '@Auth/decorators';
import type { EnvConfig } from '@Config';
import { ApiExcludeController } from '@nestjs/swagger';
import { RateLimitCleanupService } from './rate-limit-cleanup.service.js';

@ApiExcludeController()
@Controller('internal')
export class InternalCleanupController {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService<EnvConfig, true>,
    @Inject(RateLimitCleanupService) private readonly service: RateLimitCleanupService,
  ) {}

  @Public()
  @Get('cleanup')
  @Header('Cache-Control', 'no-store')
  async cleanup(@Headers('authorization') authorization: string | undefined) {
    const secret = this.config.get('CRON_SECRET', { infer: true });
    if (!secret) throw new NotFoundException();
    const supplied = createHash('sha256').update(authorization ?? '').digest();
    const expected = createHash('sha256').update(`Bearer ${secret}`).digest();
    if (!timingSafeEqual(supplied, expected)) throw new UnauthorizedException();
    return this.service.cleanup();
  }
}
