import { forwardRef, Module } from '@nestjs/common';
import { MatchesService } from './matches.service';
import { MatchesController } from './matches.controller';
import { TournamentScheduleController } from './tournament-schedule.controller';
import { MatchesRepository } from './matches.repository';
import { DatabaseModule } from '../../database/database.module';
import { LiveScoreGateway } from './live-score.gateway';
import { AuthModule } from '../auth/auth.module';
import { RankingsModule } from '../rankings/rankings.module';
import { RedisModule } from '../../providers/redis/redis.module';
import { MatchContextAdapter } from './match-context.adapter';
import { ClubMatchSessionsModule } from '../club-match-sessions/club-match-sessions.module';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    RankingsModule,
    RedisModule,
    forwardRef(() => ClubMatchSessionsModule),
  ],
  controllers: [MatchesController, TournamentScheduleController],
  providers: [
    MatchesService,
    MatchesRepository,
    MatchContextAdapter,
    LiveScoreGateway,
  ],
  exports: [MatchesService, MatchContextAdapter, LiveScoreGateway],
})
export class MatchesModule {}
