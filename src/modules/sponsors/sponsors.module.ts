import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { TournamentsModule } from '../tournaments/tournaments.module';
import { SponsorsController } from './sponsors.controller';
import { SponsorsRepository } from './sponsors.repository';
import { SponsorsService } from './sponsors.service';

@Module({
  imports: [DatabaseModule, TournamentsModule],
  controllers: [SponsorsController],
  providers: [SponsorsRepository, SponsorsService],
  exports: [SponsorsService],
})
export class SponsorsModule {}
