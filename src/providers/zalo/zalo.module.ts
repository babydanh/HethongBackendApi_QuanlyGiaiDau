import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../../database/database.module';
import { ZaloBusinessService } from './zalo-business.service';
import { ZaloNotificationOutboxProcessor } from './zalo-notification-outbox.processor';

@Global()
@Module({
  imports: [ConfigModule, DatabaseModule],
  providers: [ZaloBusinessService, ZaloNotificationOutboxProcessor],
  exports: [ZaloBusinessService],
})
export class ZaloModule {}
