import { Module } from '@nestjs/common';
import { HttpSecurityService } from './http-security.service.js';
import { RateLimitCleanupService } from './rate-limit-cleanup.service.js';

@Module({
  providers: [HttpSecurityService, RateLimitCleanupService],
  exports: [HttpSecurityService],
})
export class SecurityModule {}
