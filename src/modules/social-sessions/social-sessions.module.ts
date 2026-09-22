import { Module } from '@nestjs/common';
import { SocialSessionsController } from './social-sessions.controller';
import { SocialSessionsRepository } from './social-sessions.repository';
import { SocialSessionsService } from './social-sessions.service';

@Module({
  controllers: [SocialSessionsController],
  providers: [SocialSessionsRepository, SocialSessionsService],
  exports: [SocialSessionsService],
})
export class SocialSessionsModule {}
