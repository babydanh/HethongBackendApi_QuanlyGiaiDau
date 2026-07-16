import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { TournamentsModule } from '../tournaments/tournaments.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MatchesModule } from '../matches/matches.module';
import { PaymentsModule } from '../payments/payments.module';
import { RankingsModule } from '../rankings/rankings.module';

@Module({
  imports: [ConfigModule, TournamentsModule, NotificationsModule, MatchesModule, PaymentsModule, RankingsModule],
  controllers: [AiController],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
