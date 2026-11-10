import { Module } from '@nestjs/common';
import { NotificationsController } from './controllers/notifications.controller.js';
import { NotificationsService } from './services/notifications.service.js';
import { NotificationsRepository } from './repositories/notifications.repository.js';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsRepository],
  exports: [NotificationsService],
})
export class NotificationsModule {}
