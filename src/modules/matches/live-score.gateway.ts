import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UseGuards } from '@nestjs/common';
import { WsJwtGuard } from '../../common/guards/ws-jwt.guard';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: '/live',
})
@UseGuards(WsJwtGuard)
export class LiveScoreGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('joinMatch')
  handleJoinMatch(
    @MessageBody() matchId: string,
    @ConnectedSocket() client: Socket,
  ) {
    const room = `match:${matchId}`;
    client.join(room);
    console.log(`Client ${client.id} joined room ${room}`);
    return { event: 'joined', data: room };
  }

  @SubscribeMessage('leaveMatch')
  handleLeaveMatch(
    @MessageBody() matchId: string,
    @ConnectedSocket() client: Socket,
  ) {
    const room = `match:${matchId}`;
    client.leave(room);
    console.log(`Client ${client.id} left room ${room}`);
    return { event: 'left', data: room };
  }

  broadcastScoreUpdate(matchId: string, matchData: any) {
    this.server.to(`match:${matchId}`).emit('score:update', matchData);
  }

  broadcastMatchStatus(matchId: string, matchData: any) {
    this.server.to(`match:${matchId}`).emit('match:status', matchData);
  }
}
