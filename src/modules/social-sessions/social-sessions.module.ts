import { Module } from '@nestjs/common';
import { ChatModule } from '../chat/chat.module';
import { SocialSessionSchedulerService } from './social-session-scheduler.service';
import { SocialSessionsController } from './social-sessions.controller';
import { SocialSessionsRepository } from './social-sessions.repository';
import { SocialSessionsService } from './social-sessions.service';

@Module({
  imports: [ChatModule],
  controllers: [SocialSessionsController],
  providers: [
    SocialSessionsRepository,
    SocialSessionsService,
    SocialSessionSchedulerService,
  ],
  exports: [SocialSessionsService],
})
export class SocialSessionsModule {}
