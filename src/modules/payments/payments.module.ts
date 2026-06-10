import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { PaymentsRepository } from './payments.repository';
import { DatabaseModule } from '../../database/database.module';
import { TournamentsModule } from '../tournaments/tournaments.module';

@Module({
  imports: [DatabaseModule, TournamentsModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, PaymentsRepository],
  exports: [PaymentsService],
})
export class PaymentsModule {}
