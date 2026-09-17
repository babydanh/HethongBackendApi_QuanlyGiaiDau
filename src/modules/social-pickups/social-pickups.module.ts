import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { SocialPickupsController } from './social-pickups.controller';
import { SocialPickupsRepository } from './social-pickups.repository';
import { SocialPickupsService } from './social-pickups.service';

@Module({
  imports: [DatabaseModule],
  controllers: [SocialPickupsController],
  providers: [SocialPickupsRepository, SocialPickupsService],
  exports: [SocialPickupsRepository, SocialPickupsService],
})
export class SocialPickupsModule {}

