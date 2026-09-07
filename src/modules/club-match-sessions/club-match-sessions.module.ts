import { Module } from '@nestjs/common';
import { MatchesModule } from '../matches/matches.module';
import { RankingsModule } from '../rankings/rankings.module';
import { ClubMatchSessionsController } from './club-match-sessions.controller';
import { ClubMatchSessionsRepository } from './club-match-sessions.repository';
import { ClubMatchSessionsService } from './club-match-sessions.service';

@Module({
  imports: [MatchesModule, RankingsModule],
  controllers: [ClubMatchSessionsController],
  providers: [ClubMatchSessionsRepository, ClubMatchSessionsService],
  exports: [ClubMatchSessionsService],
})
export class ClubMatchSessionsModule {}
