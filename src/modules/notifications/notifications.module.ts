import { Module, Global } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsRepository } from './notifications.repository';
import { NotificationsGateway } from './notifications.gateway';
import { DatabaseModule } from '../../database/database.module';

@Global()
@Module({
  imports: [DatabaseModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsRepository, NotificationsGateway],
  exports: [NotificationsService],
})
export class NotificationsModule {}
