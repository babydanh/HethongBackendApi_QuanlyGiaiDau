import { Module } from '@nestjs/common';
import { TournamentsService } from './tournaments.service';
import { TournamentsController } from './tournaments.controller';
import { TournamentsRepository } from './tournaments.repository';
import { BracketGeneratorService } from './bracket-generator.service';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [TournamentsController],
  providers: [
    TournamentsService,
    TournamentsRepository,
    BracketGeneratorService,
  ],
  exports: [TournamentsService],
})
export class TournamentsModule {}
