import { Module } from '@nestjs/common';
import { SocialService } from './social.service';
import { SocialController } from './social.controller';
import { SocialRepository } from './social.repository';
import { DatabaseModule } from '../../database/database.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [DatabaseModule, NotificationsModule],
  controllers: [SocialController],
  providers: [SocialService, SocialRepository],
  exports: [SocialService],
})
export class SocialModule {}
