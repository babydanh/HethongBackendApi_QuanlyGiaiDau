import { Module } from '@nestjs/common';
import { TournamentsService } from './tournaments.service';
import { TournamentsController } from './tournaments.controller';
import { TournamentsRepository } from './tournaments.repository';
import { BracketGeneratorService } from './bracket-generator.service';
import { TournamentSchedulerService } from './tournament-scheduler.service';
import { DatabaseModule } from '../../database/database.module';
import { SeriesModule } from '../series/series.module';

@Module({
  imports: [DatabaseModule, SeriesModule],
  controllers: [TournamentsController],
  providers: [
    TournamentsService,
    TournamentsRepository,
    BracketGeneratorService,
    TournamentSchedulerService,
  ],
  exports: [TournamentsService, BracketGeneratorService],
})
export class TournamentsModule {}
