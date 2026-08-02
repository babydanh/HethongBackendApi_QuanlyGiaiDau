import { Module } from '@nestjs/common';
import { AdvertisementsController } from './advertisements.controller';
import { AdvertisementsService } from './advertisements.service';
import { AdvertisementsRepository } from './advertisements.repository';

@Module({
  controllers: [AdvertisementsController],
  providers: [AdvertisementsService, AdvertisementsRepository],
  exports: [AdvertisementsService, AdvertisementsRepository],
})
export class AdvertisementsModule {}
