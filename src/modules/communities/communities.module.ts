import { Module } from '@nestjs/common';
import { CommunitiesService } from './communities.service';
import { CommunitiesController } from './communities.controller';
import { CommunitiesRepository } from './communities.repository';
import { NotificationsModule } from '../notifications/notifications.module';
import { StorageModule } from '../../providers/storage/storage.module';
import { CommunitySocialController } from './community-social.controller';
import { CommunitySocialRepository } from './community-social.repository';
import { CommunitySocialService } from './community-social.service';

import { CommunityWhiteboxService } from './moderation/community-whitebox.service';
import { CommunityBlackboxAiService } from './moderation/community-blackbox-ai.service';

@Module({
  imports: [NotificationsModule, StorageModule],
  controllers: [CommunitiesController, CommunitySocialController],
  providers: [
    CommunitiesService,
    CommunitiesRepository,
    CommunitySocialService,
    CommunitySocialRepository,
    CommunityWhiteboxService,
    CommunityBlackboxAiService,
  ],
  exports: [
    CommunitiesService,
    CommunitySocialRepository,
    CommunityWhiteboxService,
    CommunityBlackboxAiService,
  ],
})
export class CommunitiesModule {}

