import { Module } from '@nestjs/common';
import { ChatModule } from '../chat/chat.module';
import { RegionsModule } from '../regions/regions.module';
import { VenuesModule } from '../venues/venues.module';
import { SocialSessionSchedulerService } from './social-session-scheduler.service';
import { SocialSessionsController } from './social-sessions.controller';
import { SocialSessionsRepository } from './social-sessions.repository';
import { SocialSessionsService } from './social-sessions.service';
import { NearbySocialsController } from './nearby-socials.controller';

@Module({
  imports: [ChatModule, RegionsModule, VenuesModule],
  controllers: [SocialSessionsController, NearbySocialsController],
  providers: [
    SocialSessionsRepository,
    SocialSessionsService,
    SocialSessionSchedulerService,
  ],
  exports: [SocialSessionsService],
})
export class SocialSessionsModule {}
