import { Module } from '@nestjs/common';
import { HttpSecurityService } from './http-security.service.js';
import { RateLimitCleanupService } from './rate-limit-cleanup.service.js';

import { InternalCleanupController } from './internal-cleanup.controller.js';

@Module({
  controllers: [InternalCleanupController],
  providers: [HttpSecurityService, RateLimitCleanupService],
  exports: [HttpSecurityService],
})
export class SecurityModule {}
