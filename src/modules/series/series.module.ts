import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { SeriesRepository } from './series.repository';
import { SeriesService } from './series.service';
import { SeriesController, OrganizerSeriesController } from './series.controller';
import { SeriesInvitationsController, OrganizerSeriesStaffController } from './series-staff.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [
    SeriesController,
    OrganizerSeriesController,
    SeriesInvitationsController,
    OrganizerSeriesStaffController,
  ],
  providers: [SeriesRepository, SeriesService],
  exports: [SeriesRepository, SeriesService],
})
export class SeriesModule {}
