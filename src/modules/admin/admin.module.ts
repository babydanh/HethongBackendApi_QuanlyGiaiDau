import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { AdminTicketsController } from './admin-tickets.controller';
import { AdminModerationController } from './admin-moderation.controller';
import { AdminConfigController } from './admin-config.controller';
import { DatabaseModule } from '../../database/database.module';
import { RankingsModule } from '../rankings/rankings.module';

@Module({
  imports: [DatabaseModule, RankingsModule],
  controllers: [
    AdminController,
    AdminTicketsController,
    AdminModerationController,
    AdminConfigController,
  ],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
