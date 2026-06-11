import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { UsersRepository } from './users.repository';
import { UploadModule } from '../upload/upload.module';
import { RankingsModule } from '../rankings/rankings.module';

@Module({
  imports: [UploadModule, RankingsModule],
  controllers: [UsersController],
  providers: [UsersService, UsersRepository],
  exports: [UsersService],
})
export class UsersModule {}
