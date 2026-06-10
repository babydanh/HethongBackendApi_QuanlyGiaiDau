import { Module } from '@nestjs/common';
import { ChallengesService } from './challenges.service';
import { ChallengesController } from './challenges.controller';
import { ChallengesRepository } from './challenges.repository';
import { TournamentsModule } from '../tournaments/tournaments.module';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [DatabaseModule, TournamentsModule],
  controllers: [ChallengesController],
  providers: [ChallengesService, ChallengesRepository],
  exports: [ChallengesService],
})
export class ChallengesModule {}
