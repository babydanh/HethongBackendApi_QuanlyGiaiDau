import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { FootballTeamsController } from './football-teams.controller';
import { FootballTeamsRepository } from './football-teams.repository';
import { FootballTeamsService } from './football-teams.service';

@Module({
  imports: [NotificationsModule],
  controllers: [FootballTeamsController],
  providers: [FootballTeamsRepository, FootballTeamsService],
  exports: [FootballTeamsRepository, FootballTeamsService],
})
export class FootballTeamsModule {}
