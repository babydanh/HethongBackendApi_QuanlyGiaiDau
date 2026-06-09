import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UseGuards } from '@nestjs/common';
import { WsJwtGuard } from '../../common/guards/ws-jwt.guard';
import { SendChatMessageDto } from './dto/send-chat-message.dto';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: '/chat',
})
@UseGuards(WsJwtGuard)
export class ChatGateway {
  @WebSocketServer()
  server: Server;

  @SubscribeMessage('joinChatRoom')
  handleJoinRoom(
    @MessageBody() roomId: string,
    @ConnectedSocket() client: Socket,
  ) {
    const room = `chat:${roomId}`;
    client.join(room);
    return { event: 'joined', data: room };
  }

  @SubscribeMessage('leaveChatRoom')
  handleLeaveRoom(
    @MessageBody() roomId: string,
    @ConnectedSocket() client: Socket,
  ) {
    const room = `chat:${roomId}`;
    client.leave(room);
    return { event: 'left', data: room };
  }

  @SubscribeMessage('sendMessage')
  handleMessage(
    @MessageBody() payload: SendChatMessageDto,
    @ConnectedSocket() client: Socket,
  ) {
    // Nhờ có WsJwtGuard, ta lấy được thông tin người gửi
    const user = client.data.user; 
    
    const messagePayload = {
      senderId: user.sub,
      senderName: user.email, // Tạm thời dùng email, sau này query tên
      content: payload.content,
      timestamp: new Date().toISOString()
    };

    // Phát tin nhắn này cho toàn bộ user đang ở trong roomId
    this.broadcastMessage(payload.roomId, messagePayload);

    return { event: 'messageSent', data: messagePayload };
  }

  broadcastMessage(roomId: string, message: any) {
    this.server.to(`chat:${roomId}`).emit('chat:message', message);
  }
}
