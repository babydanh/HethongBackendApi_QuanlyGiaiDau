import { Module } from '@nestjs/common';
import { SocialLocationsController } from './social-locations.controller';
import { SocialLocationsService } from './social-locations.service';
import { PhotonProvider, PLACE_PROVIDER } from './photon.provider';
import { PlacesController } from './places.controller';
import { RegionsModule } from '../regions/regions.module';

@Module({
  imports: [RegionsModule],
  controllers: [SocialLocationsController, PlacesController],
  providers: [SocialLocationsService, PhotonProvider, { provide: PLACE_PROVIDER, useExisting: PhotonProvider }],
})
export class SocialLocationsModule {}
