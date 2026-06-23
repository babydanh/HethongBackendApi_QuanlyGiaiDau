import { Module } from '@nestjs/common';
import { StorageModule } from '../../providers/storage/storage.module';
import { UploadController } from './upload.controller';

@Module({
  imports: [StorageModule],
  controllers: [UploadController],
  exports: [StorageModule],
})
export class UploadModule {}
