import { Module } from '@nestjs/common';
import { CommunitiesService } from './communities.service';
import { CommunitiesController } from './communities.controller';
import { CommunitiesRepository } from './communities.repository';
import { NotificationsModule } from '../notifications/notifications.module';
import { StorageModule } from '../../providers/storage/storage.module';

@Module({
  imports: [NotificationsModule, StorageModule],
  controllers: [CommunitiesController],
  providers: [CommunitiesService, CommunitiesRepository],
  exports: [CommunitiesService],
})
export class CommunitiesModule {}
