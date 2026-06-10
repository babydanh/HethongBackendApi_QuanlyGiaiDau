import { Module } from '@nestjs/common';
import { RankingsService } from './rankings.service';
import { RankingsController } from './rankings.controller';
import { RankingsRepository } from './rankings.repository';
import { EloEngineService } from './elo-engine.service';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [RankingsController],
  providers: [RankingsService, RankingsRepository, EloEngineService],
  exports: [RankingsService, EloEngineService],
})
export class RankingsModule {}
