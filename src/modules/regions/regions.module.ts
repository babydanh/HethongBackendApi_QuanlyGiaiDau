import { Module } from '@nestjs/common';
import { RegionsService } from './regions.service';
import { RegionsController } from './regions.controller';
import { RegionsRepository } from './regions.repository';

@Module({
  controllers: [RegionsController],
  providers: [RegionsService, RegionsRepository],
  exports: [RegionsService],
})
export class RegionsModule {}
