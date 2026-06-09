import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: '/notifications',
})
export class NotificationsGateway {
  @WebSocketServer()
  server: Server;

  @SubscribeMessage('subscribe')
  handleSubscribe(
    @MessageBody() userId: string,
    @ConnectedSocket() client: Socket,
  ) {
    const room = `user:${userId}`;
    client.join(room);
    return { event: 'subscribed', data: room };
  }

  pushNotification(userId: string, notification: Record<string, unknown>) {
    this.server.to(`user:${userId}`).emit('notification:new', notification);
  }
}
