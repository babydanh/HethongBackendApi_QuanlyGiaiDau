import { Module } from '@nestjs/common';
import { MatchesService } from './matches.service';
import { MatchesController } from './matches.controller';
import { TournamentScheduleController } from './tournament-schedule.controller';
import { MatchesRepository } from './matches.repository';
import { DatabaseModule } from '../../database/database.module';
import { LiveScoreGateway } from './live-score.gateway';
import { AuthModule } from '../auth/auth.module';
import { RankingsModule } from '../rankings/rankings.module';
import { RedisModule } from '../../providers/redis/redis.module';

@Module({
  imports: [DatabaseModule, AuthModule, RankingsModule, RedisModule],
  controllers: [MatchesController, TournamentScheduleController],
  providers: [MatchesService, MatchesRepository, LiveScoreGateway],
  exports: [MatchesService, LiveScoreGateway],
})
export class MatchesModule {}
