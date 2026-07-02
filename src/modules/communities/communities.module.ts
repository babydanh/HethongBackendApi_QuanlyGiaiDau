import { Module } from '@nestjs/common';
import { CommunitiesService } from './communities.service';
import { CommunitiesController } from './communities.controller';
import { CommunitiesRepository } from './communities.repository';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [CommunitiesController],
  providers: [CommunitiesService, CommunitiesRepository],
  exports: [CommunitiesService],
})
export class CommunitiesModule {}
