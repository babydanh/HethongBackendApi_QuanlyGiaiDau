import { Module } from '@nestjs/common';
import { RankingsService } from './rankings.service';
import { RankingsController } from './rankings.controller';
import { RankingsRepository } from './rankings.repository';
import { EloEngineService } from './elo-engine.service';
import { EloOutboxProcessor } from './elo-outbox.processor';
import { DatabaseModule } from '../../database/database.module';
import { RedisModule } from '../../providers/redis/redis.module';
import { FootballTeamEloService } from './football-team-elo.service';

@Module({
  imports: [DatabaseModule, RedisModule],
  controllers: [RankingsController],
  providers: [RankingsService, RankingsRepository, EloEngineService, EloOutboxProcessor, FootballTeamEloService],
  exports: [RankingsService, EloEngineService, FootballTeamEloService],
})
export class RankingsModule {}
