import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { LivestreamController } from './livestream.controller';
import { LivestreamRepository } from './livestream.repository';
import { LivestreamService } from './livestream.service';

@Module({
  imports: [DatabaseModule],
  controllers: [LivestreamController],
  providers: [LivestreamService, LivestreamRepository],
  exports: [LivestreamService],
})
export class LivestreamModule {}
