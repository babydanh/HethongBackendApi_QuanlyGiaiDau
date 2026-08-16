import { UseGuards } from '@nestjs/common';
import type { InferSelectModel } from 'drizzle-orm';
import {
  ConnectedSocket,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { WsJwtGuard } from '../../common/guards/ws-jwt.guard';
import { extractWsToken } from '../../common/guards/ws-jwt.guard';
import { corsOptions } from '../../config/cors.config';
import * as schema from '../../database/schema';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@WebSocketGateway({
  cors: corsOptions,
  namespace: '/notifications',
})
@UseGuards(WsJwtGuard)
export class NotificationsGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  constructor(private readonly jwtService: JwtService) {}

  handleConnection(client: Socket) {
    try {
      // Ws guards run for message handlers, not reliably before the gateway
      // connection lifecycle. Authenticate here before joining the user room
      // so mobile/browser clients are not disconnected immediately.
      const token = extractWsToken(client);
      if (!token) throw new WsException('Unauthorized');
      client.data.user = this.jwtService.verify<JwtPayload>(token);
      const userId = this.getAuthenticatedUserId(client);
      client.join(this.getUserRoom(userId));
    } catch (error) {
      client.disconnect();
    }
  }

  @SubscribeMessage('subscribe')
  handleSubscribe(@ConnectedSocket() client: Socket) {
    const room = this.getUserRoom(this.getAuthenticatedUserId(client));
    client.join(room);
    return { event: 'subscribed', data: room };
  }

  pushNotification(
    userId: string,
    notification: InferSelectModel<typeof schema.notifications>,
  ) {
    this.server.to(this.getUserRoom(userId)).emit('notification:new', notification);
  }

  private getAuthenticatedUserId(client: Socket): string {
    const user = client.data.user as JwtPayload | undefined;

    if (!user?.sub) {
      throw new WsException('Unauthorized');
    }

    return user.sub;
  }

  private getUserRoom(userId: string): string {
    return `user:${userId}`;
  }
}
