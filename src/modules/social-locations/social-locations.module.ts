import { Module } from '@nestjs/common';
import { SocialLocationsController } from './social-locations.controller';
import { SocialLocationsService } from './social-locations.service';

@Module({
  controllers: [SocialLocationsController],
  providers: [SocialLocationsService],
})
export class SocialLocationsModule {}
