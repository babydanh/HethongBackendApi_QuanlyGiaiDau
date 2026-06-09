import { Module } from '@nestjs/common';
import { VenuesService } from './venues.service';
import { VenuesController } from './venues.controller';
import { VenuesRepository } from './venues.repository';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [VenuesController],
  providers: [VenuesService, VenuesRepository],
  exports: [VenuesService],
})
export class VenuesModule {}
