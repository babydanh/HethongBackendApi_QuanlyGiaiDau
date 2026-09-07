import { Module } from '@nestjs/common';
import { MatchesModule } from '../matches/matches.module';
import { RankingsModule } from '../rankings/rankings.module';
import { ClubMatchSessionsController } from './club-match-sessions.controller';
import { ClubMatchSessionsRepository } from './club-match-sessions.repository';
import { ClubMatchSessionsService } from './club-match-sessions.service';
import { ClubMatchSessionSchedulerService } from './club-match-session-scheduler.service';

@Module({
  imports: [MatchesModule, RankingsModule],
  controllers: [ClubMatchSessionsController],
  providers: [
    ClubMatchSessionsRepository,
    ClubMatchSessionsService,
    ClubMatchSessionSchedulerService,
  ],
  exports: [ClubMatchSessionsService],
})
export class ClubMatchSessionsModule {}
