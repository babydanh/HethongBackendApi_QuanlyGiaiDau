import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { PaymentsRepository } from './payments.repository';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, PaymentsRepository],
  exports: [PaymentsService],
})
export class PaymentsModule {}
