import { Module } from '@nestjs/common';
import { SocialService } from './social.service';
import { SocialController } from './social.controller';
import { SocialRepository } from './social.repository';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [SocialController],
  providers: [SocialService, SocialRepository],
  exports: [SocialService],
})
export class SocialModule {}
