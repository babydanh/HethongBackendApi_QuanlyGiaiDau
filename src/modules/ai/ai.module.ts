import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { TournamentsModule } from '../tournaments/tournaments.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MatchesModule } from '../matches/matches.module';
import { PaymentsModule } from '../payments/payments.module';
import { RankingsModule } from '../rankings/rankings.module';
import { CommunitiesModule } from '../communities/communities.module';
import { AiToolRegistry } from './ai-tool.registry';
import { AiToolRouter } from './ai-tool.router';

@Module({
  imports: [ConfigModule, TournamentsModule, NotificationsModule, MatchesModule, PaymentsModule, RankingsModule, CommunitiesModule],
  controllers: [AiController],
  providers: [AiService, AiToolRegistry, AiToolRouter],
  exports: [AiService],
})
export class AiModule {}
