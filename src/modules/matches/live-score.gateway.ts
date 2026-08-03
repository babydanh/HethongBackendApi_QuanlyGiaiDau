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
  
  // Bộ đệm gộp tin (Batching) cho viewer counts
  private readonly pendingViewerUpdates = new Set<string>();
  private batchInterval: NodeJS.Timeout | null = null;
  private metricsInterval: NodeJS.Timeout | null = null;

  // Khởi tạo monitor đo độ trễ Event Loop của Node.js
  private readonly loopMonitor = monitorEventLoopDelay({ resolution: 20 });

  constructor() {
    this.loopMonitor.enable();

    // Khởi tạo vòng lặp gộp tin gửi lượt xem định kỳ 1 giây/lần
    this.batchInterval = setInterval(() => {
      this.flushViewerCounts();
    }, 1000);

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
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }
    this.loopMonitor.disable();
  }

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
    
    // Zombie connection prevention: 
    // Ngắt kết nối client sau 30 giây nếu họ không tham gia bất kỳ phòng (Room) trận đấu nào.
    setTimeout(() => {
      if (client.connected) {
        const joinedRooms = this.clientMatchRooms.get(client.id);
        if (!joinedRooms || joinedRooms.size === 0) {
          this.logger.warn(`Disconnecting zombie client ${client.id} due to inactivity (not joined any match).`);
          client.disconnect(true);
        }
      }
    }, 30000);
  }

  handleDisconnect(client: Socket) {
    const joinedMatchIds = this.clientMatchRooms.get(client.id);
    if (joinedMatchIds) {
      joinedMatchIds.forEach((matchId) => {
        // Đưa vào hàng chờ gộp tin thay vì phát đi lập tức
        this.pendingViewerUpdates.add(matchId);
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
    
    // Đăng ký cập nhật lượt xem vào hàng chờ gộp tin
    this.pendingViewerUpdates.add(matchId);
    
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
    
    // Đăng ký cập nhật lượt xem vào hàng chờ gộp tin
    this.pendingViewerUpdates.add(matchId);
    
    this.logger.log(`Client ${client.id} left room ${room}`);
    return { event: 'left', data: room };
  }

  // Tối ưu hoá: Mã hóa 1 lần (Single JSON stringify) + Chống áp lực ngược (Volatile drop)
  broadcastScoreUpdate(matchId: string, matchData: MatchBroadcastData) {
    if (!this.server) return;
    const rawPayload = JSON.stringify(matchData);
    this.server.to(`match:${matchId}`).emit('score:update', rawPayload);
  }

  broadcastMatchStatus(matchId: string, matchData: MatchBroadcastData) {
    if (!this.server) return;
    const rawPayload = JSON.stringify(matchData);
    this.server.to(`match:${matchId}`).emit('match:status', rawPayload);
  }

  // Định kỳ phát viewer count từ hàng chờ gộp tin
  private flushViewerCounts() {
    if (this.pendingViewerUpdates.size === 0 || !this.server) return;

    this.pendingViewerUpdates.forEach((matchId) => {
      const room = `match:${matchId}`;
      const serverInstance = this.server as unknown as Record<string, { rooms: Map<string, { size: number }> }>;
      const rooms = serverInstance.adapter?.rooms;
      const viewerCount = rooms?.get(room)?.size ?? 0;
      
      const payload = JSON.stringify({ matchId, viewerCount });
      this.server.volatile.to(room).emit('viewer:count', payload);
    });

    this.pendingViewerUpdates.clear();
  }

  broadcastComment(matchId: string, comment: unknown) {
    if (!this.server) return;
    const rawPayload = JSON.stringify(comment);
    this.server.volatile.to(`match:${matchId}`).emit('comment:new', rawPayload);
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
