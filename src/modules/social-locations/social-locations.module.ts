import { Module } from '@nestjs/common';
import { SocialLocationsController } from './social-locations.controller';
import { SocialLocationsService } from './social-locations.service';
import { VenuesModule } from '../venues/venues.module';

@Module({ imports: [VenuesModule], controllers: [SocialLocationsController], providers: [SocialLocationsService] })
export class SocialLocationsModule {}
