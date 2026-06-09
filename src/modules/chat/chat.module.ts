import { Module } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { ChatRepository } from './chat.repository';
import { ChatGateway } from './chat.gateway';
import { DatabaseModule } from '../../database/database.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [ChatController],
  providers: [ChatService, ChatRepository, ChatGateway],
  exports: [ChatService],
})
export class ChatModule {}
