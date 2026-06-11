import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { SeriesRepository } from './series.repository';
import { SeriesService } from './series.service';
import { SeriesController, OrganizerSeriesController } from './series.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [SeriesController, OrganizerSeriesController],
  providers: [SeriesRepository, SeriesService],
  exports: [SeriesRepository, SeriesService],
})
export class SeriesModule {}
