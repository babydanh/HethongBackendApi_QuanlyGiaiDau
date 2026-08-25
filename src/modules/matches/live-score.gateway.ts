import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { MatchesRepository } from './matches.repository';
import { extractWsToken } from '../../common/guards/ws-jwt.guard';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { MatchBroadcastData } from './interfaces/match-broadcast.interface';
import { corsOptions } from '../../config/cors.config';
import { monitorEventLoopDelay } from 'perf_hooks';

@WebSocketGateway({
  cors: corsOptions,
  namespace: '/live',
  pingInterval: 25000,
  pingTimeout: 10000,
  maxHttpBufferSize: 1e6, // Giới hạn đệm tối đa 1MB tránh tràn bộ nhớ
})
export class LiveScoreGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;
  private readonly logger = new Logger(LiveScoreGateway.name);

  private readonly clientMatchRooms = new Map<string, Set<string>>();
  private readonly clientTournamentRooms = new Map<string, Set<string>>();
  private readonly zombieDisconnectTimers = new Map<string, NodeJS.Timeout>();
  
  // Bộ đệm gộp tin (Batching) cho viewer counts
  private readonly pendingViewerUpdates = new Set<string>();
  private batchInterval: NodeJS.Timeout | null = null;
  private viewerSyncInterval: NodeJS.Timeout | null = null;
  private metricsInterval: NodeJS.Timeout | null = null;

  // Khởi tạo monitor đo độ trễ Event Loop của Node.js
  private readonly loopMonitor = monitorEventLoopDelay({ resolution: 20 });

  constructor(
    private readonly matchesRepository: MatchesRepository,
    private readonly jwtService: JwtService,
  ) {
    this.loopMonitor.enable();

    // Khởi tạo vòng lặp gộp tin gửi lượt xem định kỳ 1 giây/lần
    this.batchInterval = setInterval(() => {
      this.flushViewerCounts();
    }, 1000);

    // Broadcast định kỳ lượt xem cho MỌI trận đang có người xem (5 giây/lần).
    // Tin viewer:count khi join dùng volatile — dễ bị rớt khi client nghẽn
    // => số "đang xem" bị kẹt không tăng. Vòng này tự hội tụ lại đúng.
    this.viewerSyncInterval = setInterval(() => {
      this.broadcastAllViewerCounts();
    }, 5000);

    // Phát thông số hệ thống (Event Loop Delay, Active Connections, Buffer) mỗi 2 giây
    this.metricsInterval = setInterval(() => {
      this.broadcastSystemMetrics();
    }, 2000);
  }

  // Dọn dẹp interval khi hủy Gateway
  onApplicationShutdown() {
    if (this.batchInterval) {
      clearInterval(this.batchInterval);
    }
    if (this.viewerSyncInterval) {
      clearInterval(this.viewerSyncInterval);
    }
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }
    this.loopMonitor.disable();
    this.zombieDisconnectTimers.forEach((timer) => clearTimeout(timer));
    this.zombieDisconnectTimers.clear();
  }

  handleConnection(client: Socket) {
    const token = extractWsToken(client, { allowQueryToken: false });
    if (token) {
      try {
        client.data.user = this.jwtService.verify<JwtPayload>(token);
      } catch {
        // Anonymous access remains valid for public live rooms. An invalid
        // token simply cannot authorize entry into a private room.
        client.data.user = undefined;
      }
    }

    this.logger.log(`Client connected: ${client.id}`);
    
    // Zombie connection prevention: 
    // Ngắt kết nối client sau 30 giây nếu họ không tham gia bất kỳ phòng (Room) trận đấu nào.
    const zombieTimer = setTimeout(() => {
      this.zombieDisconnectTimers.delete(client.id);
      if (client.connected) {
        const joinedRooms = this.clientMatchRooms.get(client.id);
        const joinedTournamentRooms = this.clientTournamentRooms.get(client.id);
        if ((!joinedRooms || joinedRooms.size === 0) &&
            (!joinedTournamentRooms || joinedTournamentRooms.size === 0)) {
          this.logger.warn(`Disconnecting zombie client ${client.id} due to inactivity (not joined any match).`);
          client.disconnect(true);
        }
      }
    }, 30000);
    this.zombieDisconnectTimers.set(client.id, zombieTimer);
  }

  handleDisconnect(client: Socket) {
    const zombieTimer = this.zombieDisconnectTimers.get(client.id);
    if (zombieTimer) {
      clearTimeout(zombieTimer);
      this.zombieDisconnectTimers.delete(client.id);
    }

    const joinedMatchIds = this.clientMatchRooms.get(client.id);
    if (joinedMatchIds) {
      joinedMatchIds.forEach((matchId) => {
        // Đưa vào hàng chờ gộp tin thay vì phát đi lập tức
        this.pendingViewerUpdates.add(matchId);
      });
      this.clientMatchRooms.delete(client.id);
    }
    this.clientTournamentRooms.delete(client.id);
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  private getViewerCount(matchId: string): number {
    const roomName = `match:${matchId}`;
    const adapterRoom = this.server?.sockets?.adapter?.rooms?.get(roomName);
    if (adapterRoom && adapterRoom.size > 0) {
      return adapterRoom.size;
    }
    let count = 0;
    this.clientMatchRooms.forEach((matches) => {
      if (matches.has(matchId)) {
        count++;
      }
    });
    return count;
  }

  @SubscribeMessage('joinMatch')
  async handleJoinMatch(
    @MessageBody() matchId: string,
    @ConnectedSocket() client: Socket,
  ) {
    const normalizedMatchId = typeof matchId === 'string' ? matchId.trim() : '';
    const user = client.data.user as JwtPayload | undefined;
    const roles = Array.isArray(user?.roles)
      ? user.roles
      : user?.role
        ? [user.role]
        : [];

    if (
      !normalizedMatchId ||
      !(await this.matchesRepository.canAccessLiveMatch(
        normalizedMatchId,
        user?.sub,
        roles,
      ))
    ) {
      throw new WsException('Bạn không có quyền xem trận đấu này');
    }

    const room = `match:${normalizedMatchId}`;
    client.join(room);
    const joinedMatchIds = this.clientMatchRooms.get(client.id) ?? new Set<string>();
    joinedMatchIds.add(normalizedMatchId);
    this.clientMatchRooms.set(client.id, joinedMatchIds);
    
    // Đăng ký và phát cập nhật lượt xem lập tức cho client vừa join và cả phòng
    const viewerCount = this.getViewerCount(normalizedMatchId);
    const payload = JSON.stringify({ matchId: normalizedMatchId, viewerCount });
    client.emit('viewer:count', payload);
    this.server.to(room).emit('viewer:count', payload);
    
    this.logger.log(`Client ${client.id} joined room ${room} (viewers: ${viewerCount})`);
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
    
    // Đăng ký cập nhật lượt xem vào hàng chờ gộp tin
    this.pendingViewerUpdates.add(matchId);
    
    this.logger.log(`Client ${client.id} left room ${room}`);
    return { event: 'left', data: room };
  }

  @SubscribeMessage('joinTournament')
  async handleJoinTournament(
    @MessageBody() tournamentId: string,
    @ConnectedSocket() client: Socket,
  ) {
    const normalizedTournamentId =
      typeof tournamentId === 'string' ? tournamentId.trim() : '';
    const user = client.data.user as JwtPayload | undefined;
    const roles = Array.isArray(user?.roles)
      ? user.roles
      : user?.role
        ? [user.role]
        : [];

    if (
      !normalizedTournamentId ||
      !(await this.matchesRepository.canAccessLiveTournament(
        normalizedTournamentId,
        user?.sub,
        roles,
      ))
    ) {
      throw new WsException('Bạn không có quyền theo dõi giải đấu này');
    }

    const room = `tournament:${normalizedTournamentId}`;
    client.join(room);
    const joinedTournamentIds = this.clientTournamentRooms.get(client.id) ?? new Set<string>();
    joinedTournamentIds.add(normalizedTournamentId);
    this.clientTournamentRooms.set(client.id, joinedTournamentIds);
    return { event: 'joined', data: room };
  }

  @SubscribeMessage('leaveTournament')
  handleLeaveTournament(
    @MessageBody() tournamentId: string,
    @ConnectedSocket() client: Socket,
  ) {
    const room = `tournament:${tournamentId}`;
    client.leave(room);
    const joinedTournamentIds = this.clientTournamentRooms.get(client.id);
    if (joinedTournamentIds) {
      joinedTournamentIds.delete(tournamentId);
      if (joinedTournamentIds.size === 0) {
        this.clientTournamentRooms.delete(client.id);
      }
    }
    return { event: 'left', data: room };
  }

  private normalizeMatchBroadcastData(
    matchData: MatchBroadcastData,
    tournamentId?: string | null,
  ): MatchBroadcastData {
    const participant1 = matchData.participant1;
    const participant2 = matchData.participant2;
    const getParticipantDivisionId = (participant: unknown) => {
      if (!participant || typeof participant !== 'object') return null;
      const value = (participant as { tournamentDivisionId?: unknown }).tournamentDivisionId;
      return typeof value === 'string' && value.length > 0 ? value : null;
    };
    const divisionId =
      (typeof matchData.divisionId === 'string' && matchData.divisionId.length > 0
        ? matchData.divisionId
        : null) ??
      getParticipantDivisionId(participant1) ??
      getParticipantDivisionId(participant2);

    return {
      ...matchData,
      tournamentId: matchData.tournamentId ?? tournamentId ?? undefined,
      divisionId,
    };
  }

  // Tối ưu hoá: Mã hóa 1 lần (Single JSON stringify) + Chống áp lực ngược (Volatile drop)
  broadcastScoreUpdate(matchId: string, matchData: MatchBroadcastData, tournamentId?: string | null) {
    if (!this.server) return;
    const rawPayload = JSON.stringify(this.normalizeMatchBroadcastData(matchData, tournamentId));
    this.server.to(`match:${matchId}`).emit('score:update', rawPayload);
    if (tournamentId) {
      this.server.to(`tournament:${tournamentId}`).emit('match:update', rawPayload);
    }
  }

  broadcastMatchStatus(matchId: string, matchData: MatchBroadcastData, tournamentId?: string | null) {
    if (!this.server) return;
    const rawPayload = JSON.stringify(this.normalizeMatchBroadcastData(matchData, tournamentId));
    this.server.to(`match:${matchId}`).emit('match:status', rawPayload);
    if (tournamentId) {
      this.server.to(`tournament:${tournamentId}`).emit('match:update', rawPayload);
    }
  }

  broadcastRegistrationUpdate(
    tournamentId: string,
    payload: { participantId?: string; divisionId?: string | null; action: string },
  ) {
    if (!this.server) return;
    this.server.to(`tournament:${tournamentId}`).emit('registration:update', JSON.stringify({
      tournamentId,
      ...payload,
      occurredAt: new Date().toISOString(),
    }));
  }
  // Định kỳ phát viewer count từ hàng chờ gộp tin
  private flushViewerCounts() {
    if (this.pendingViewerUpdates.size === 0 || !this.server) return;

    this.pendingViewerUpdates.forEach((matchId) => {
      const room = `match:${matchId}`;
      const viewerCount = this.getViewerCount(matchId);
      const payload = JSON.stringify({ matchId, viewerCount });
      this.server.volatile.to(room).emit('viewer:count', payload);
    });

    this.pendingViewerUpdates.clear();
  }

  // Broadcast lượt xem cho MỌI trận đang có ít nhất 1 người xem (định kỳ).
  // Dùng emit thường (không volatile) để đảm bảo client luôn nhận được số
  // chính xác — tự phục hồi nếu tin join/leave bị rớt.
  private broadcastAllViewerCounts() {
    if (!this.server) return;
    const counts = new Map<string, number>();
    this.clientMatchRooms.forEach((matches) => {
      matches.forEach((matchId) => {
        counts.set(matchId, (counts.get(matchId) ?? 0) + 1);
      });
    });
    counts.forEach((viewerCount, matchId) => {
      const payload = JSON.stringify({ matchId, viewerCount });
      this.server.to(`match:${matchId}`).emit('viewer:count', payload);
    });
  }

  broadcastComment(matchId: string, comment: unknown) {
    if (!this.server) return;
    const rawPayload = JSON.stringify(comment);
    // Không volatile: bình luận là dữ liệu quan trọng, không được drop khi
    // server tải cao, kẻo người xem (kể cả người gửi) không thấy comment.
    this.server.to(`match:${matchId}`).emit('comment:new', rawPayload);
  }

  broadcastCheerUpdate(matchId: string, cheerCount: number) {
    if (!this.server) return;
    const rawPayload = JSON.stringify({ matchId, cheerCount });
    this.server.volatile.to(`match:${matchId}`).emit('cheer:update', rawPayload);
  }

  // Tối ưu hoá: Thu thập & Phát thông số hiệu năng
  private broadcastSystemMetrics() {
    if (!this.server) return;

    // 1. Số lượng kết nối hoạt động thực tế
    const activeConnections = this.server.sockets?.sockets?.size ?? 0;

    // 2. Độ trễ Event Loop trung bình (đổi từ nanoseconds sang miliseconds)
    const eventLoopLag = parseFloat((this.loopMonitor.mean / 1e6).toFixed(2));
    this.loopMonitor.reset(); // Reset để đo cho chu kỳ tiếp theo

    // 3. Ước tính kích thước hàng chờ buffer (Buffered Amount) trong Engine.io socket
    let totalBufferSize = 0;
    this.server.sockets?.sockets?.forEach((socket: Socket) => {
      const transport = (socket as any).conn?.transport;
      if (transport && transport.writable === false && transport.writeBuffer) {
        totalBufferSize += transport.writeBuffer.length;
      }
    });

    const payload = JSON.stringify({
      connections: activeConnections,
      eventLoopLag,
      bufferedSize: parseFloat((totalBufferSize / 1024).toFixed(2)), // Đơn vị KB
    });

    // Phát toàn cục tới tất cả client đang online để phục vụ debug/admin dashboard
    this.server.volatile.emit('system:metrics', payload);
  }
}
