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
import { Logger } from '@nestjs/common';
import { MatchBroadcastData } from './interfaces/match-broadcast.interface';
import { corsOptions } from '../../config/cors.config';

@WebSocketGateway({
  cors: corsOptions,
  namespace: '/live',
})
export class LiveScoreGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;
  private readonly logger = new Logger(LiveScoreGateway.name);

  private readonly clientMatchRooms = new Map<string, Set<string>>();

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    const joinedMatchIds = this.clientMatchRooms.get(client.id);
    if (joinedMatchIds) {
      joinedMatchIds.forEach((matchId) => {
        this.broadcastViewerCount(matchId);
      });
      this.clientMatchRooms.delete(client.id);
    }
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('joinMatch')
  handleJoinMatch(
    @MessageBody() matchId: string,
    @ConnectedSocket() client: Socket,
  ) {
    const room = `match:${matchId}`;
    client.join(room);
    const joinedMatchIds = this.clientMatchRooms.get(client.id) ?? new Set<string>();
    joinedMatchIds.add(matchId);
    this.clientMatchRooms.set(client.id, joinedMatchIds);
    this.broadcastViewerCount(matchId);
    this.logger.log(`Client ${client.id} joined room ${room}`);
    return { event: 'joined', data: room };
  }

  @SubscribeMessage('leaveMatch')
  handleLeaveMatch(
    @MessageBody() matchId: string,
    @ConnectedSocket() client: Socket,
  ) {
    const room = `match:${matchId}`;
    client.leave(room);
    const joinedMatchIds = this.clientMatchRooms.get(client.id);
    if (joinedMatchIds) {
      joinedMatchIds.delete(matchId);
      if (joinedMatchIds.size === 0) {
        this.clientMatchRooms.delete(client.id);
      } else {
        this.clientMatchRooms.set(client.id, joinedMatchIds);
      }
    }
    this.broadcastViewerCount(matchId);
    this.logger.log(`Client ${client.id} left room ${room}`);
    return { event: 'left', data: room };
  }

  broadcastScoreUpdate(matchId: string, matchData: MatchBroadcastData) {
    this.server.to(`match:${matchId}`).emit('score:update', matchData);
  }

  broadcastMatchStatus(matchId: string, matchData: MatchBroadcastData) {
    this.server.to(`match:${matchId}`).emit('match:status', matchData);
  }

  broadcastViewerCount(matchId: string) {
    const room = `match:${matchId}`;
    const viewerCount = this.server.sockets.adapter.rooms.get(room)?.size ?? 0;
    this.server.to(room).emit('viewer:count', { matchId, viewerCount });
  }

  broadcastComment(matchId: string, comment: unknown) {
    this.server.to(`match:${matchId}`).emit('comment:new', comment);
  }
}
