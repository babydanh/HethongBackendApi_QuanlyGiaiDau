import { Module } from '@nestjs/common';
import { RankingsService } from './rankings.service';
import { RankingsController } from './rankings.controller';
import { RankingsRepository } from './rankings.repository';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [RankingsController],
  providers: [RankingsService, RankingsRepository],
  exports: [RankingsService],
})
export class RankingsModule {}
