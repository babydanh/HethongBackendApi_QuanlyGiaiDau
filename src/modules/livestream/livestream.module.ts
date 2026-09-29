import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DatabaseModule } from '../../database/database.module';
import { LivestreamController } from './livestream.controller';
import { LivestreamRepository } from './livestream.repository';
import { LivestreamService } from './livestream.service';
import { LiveSessionRepository } from './live-session.repository';
import { FacebookLiveService } from './facebook-live.service';
import { FacebookPageConnectionService } from './facebook-page-connection.service';
import { FacebookTokenCryptoService } from './facebook-token-crypto.service';
import { LiveSessionService } from './live-session.service';
import { CameraDeviceService } from './camera-device.service';
import { LivestreamHealthProcessor } from './livestream-health.processor';
import { LivestreamHealthQueue } from './livestream-health.queue';

@Module({
  imports: [
    DatabaseModule,
    BullModule.registerQueue({ name: 'livestream-health' }),
  ],
  controllers: [LivestreamController],
  providers: [
    LivestreamService,
    LivestreamRepository,
    LiveSessionRepository,
    FacebookLiveService,
    FacebookTokenCryptoService,
    FacebookPageConnectionService,
    LiveSessionService,
    CameraDeviceService,
    LivestreamHealthProcessor,
    LivestreamHealthQueue,
  ],
  exports: [
    LivestreamService,
    LiveSessionService,
    FacebookLiveService,
    FacebookPageConnectionService,
    CameraDeviceService,
  ],
})
export class LivestreamModule {}
