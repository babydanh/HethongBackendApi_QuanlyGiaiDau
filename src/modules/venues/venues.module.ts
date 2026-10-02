import { Module } from '@nestjs/common';
import { VenuesService } from './venues.service';
import { VenuesController } from './venues.controller';
import { VenuesRepository } from './venues.repository';
import { DatabaseModule } from '../../database/database.module';
import { LivestreamModule } from '../livestream/livestream.module';
import { RegionsModule } from '../regions/regions.module';

@Module({
  imports: [DatabaseModule, LivestreamModule, RegionsModule],
  controllers: [VenuesController],
  providers: [VenuesService, VenuesRepository],
  exports: [VenuesService, VenuesRepository],
})
export class VenuesModule {}
