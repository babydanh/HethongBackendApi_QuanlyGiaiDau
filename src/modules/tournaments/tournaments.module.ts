import { Module } from '@nestjs/common';
import { TournamentsService } from './tournaments.service';
import { TournamentsController } from './tournaments.controller';
import { TournamentsRepository } from './tournaments.repository';
import { BracketGeneratorService } from './bracket-generator.service';
import { TournamentSchedulerService } from './tournament-scheduler.service';
import { DatabaseModule } from '../../database/database.module';
import { SeriesModule } from '../series/series.module';
import { RedisModule } from '../../providers/redis/redis.module';
import { RegistrationLockService } from './registration-lock.service';
import { StorageModule } from '../../providers/storage/storage.module';
import { AuthModule } from '../auth/auth.module';
import { CommunitiesModule } from '../communities/communities.module';
import { MatchesModule } from '../matches/matches.module';

@Module({
  imports: [DatabaseModule, SeriesModule, RedisModule, StorageModule, AuthModule, CommunitiesModule, MatchesModule],
  controllers: [TournamentsController],
  providers: [
    TournamentsService,
    TournamentsRepository,
    BracketGeneratorService,
    TournamentSchedulerService,
    RegistrationLockService,
  ],
  exports: [TournamentsService, BracketGeneratorService, RegistrationLockService, TournamentsRepository],
})
export class TournamentsModule {}
