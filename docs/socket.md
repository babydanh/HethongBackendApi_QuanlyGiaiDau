# Hướng dẫn Cài đặt & Code Socket.io (Live Score)

Tài liệu này là "giáo trình" cầm tay chỉ việc để bạn có thể tự tay implement hệ thống Real-time WebSocket cho tính năng Cập nhật Tỷ số Trực tiếp (Live Score) dựa trên đúng tiêu chuẩn của `skills.md`.

---

## Bước 1: Chuẩn bị Packages
Các package cần thiết đã được cài sẵn trong dự án:
- `@nestjs/websockets`
- `@nestjs/platform-socket.io`
- `socket.io`

Bạn không cần chạy lệnh `pnpm install` thêm gì nữa.

---

## Bước 2: Tạo WsJwtGuard (Bảo mật Socket)
Socket.io cũng cần phải được bảo vệ bằng JWT Token giống như REST API. Tạo file `src/common/guards/ws-jwt.guard.ts`.

```typescript
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';

@Injectable()
export class WsJwtGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const client: Socket = context.switchToWs().getClient<Socket>();
      
      // Client thường gửi token qua handshake auth
      const token = client.handshake.auth?.token?.split(' ')[1]; 
      
      if (!token) {
        throw new WsException('Unauthorized');
      }

      // Xác thực token và nạp payload vào đối tượng socket
      const payload = this.jwtService.verify(token);
      client.data.user = payload;
      
      return true;
    } catch (err) {
      throw new WsException('Invalid token');
    }
  }
}
```

---

## Bước 3: Khai báo LiveScoreGateway (Trái tim của hệ thống Realtime)
Tạo file `src/modules/matches/live-score.gateway.ts`. Nhiệm vụ của file này là xử lý việc khán giả kết nối (Connect), vào phòng xem (Join Room), và hệ thống phát điểm số (Broadcast).

```typescript
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

// Mở CORS và cấu hình namespace theo chuẩn
@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/live'
})
@UseGuards(WsJwtGuard)
export class LiveScoreGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  // Lifecycle hook: Khi có 1 người dùng mới connect vào WS
  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
  }

  // Lifecycle hook: Khi ngắt kết nối
  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
  }

  /**
   * Khán giả join vào phòng của 1 trận đấu cụ thể
   * Lắng nghe sự kiện từ Frontend: socket.emit('joinRoom', { matchId: '123' })
   */
  @SubscribeMessage('joinRoom')
  handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { matchId: string },
  ) {
    // Skills.md rule: Room có định dạng 'match:{matchId}'
    const roomName = `match:${payload.matchId}`;
    client.join(roomName);
    
    return { event: 'joined', data: roomName };
  }

  /**
   * Hàm này dùng cho Backend nội bộ (Service gọi Gateway)
   * Phát điểm số mới cho tất cả mọi người đang ở trong phòng trận đấu đó.
   */
  broadcastScoreUpdate(matchId: string, scoreDetails: any) {
    this.server.to(`match:${matchId}`).emit('score:update', scoreDetails);
  }
}
```

---

## Bước 4: Tích hợp vào MatchesService
Hệ thống WebSocket không đứng độc lập mà được kích hoạt bởi API HTTP (khi trọng tài nhập điểm số mới).
Mở file `src/modules/matches/matches.service.ts` và tích hợp như sau:

```typescript
import { Injectable } from '@nestjs/common';
import { LiveScoreGateway } from './live-score.gateway';

@Injectable()
export class MatchesService {
  constructor(
    private readonly liveScoreGateway: LiveScoreGateway, // Inject Gateway vào Service
    // ... Inject db, repo ...
  ) {}

  async updateScore(matchId: string, newScoreDetails: any) {
    // 1. Logic Database: Lưu điểm mới vào CSDL với db.transaction()
    // ...

    // 2. Kích hoạt Socket: Phát tín hiệu Real-time cho khán giả đang xem trận
    this.liveScoreGateway.broadcastScoreUpdate(matchId, newScoreDetails);

    return { success: true };
  }
}
```

---

## Bước 5: Đăng ký Gateway vào MatchesModule
NestJS cần biết bạn vừa tạo Gateway để nạp vào hệ thống DI (Dependency Injection).
Mở file `src/modules/matches/matches.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { MatchesService } from './matches.service';
import { LiveScoreGateway } from './live-score.gateway';
import { MatchesController } from './matches.controller';

@Module({
  controllers: [MatchesController],
  providers: [MatchesService, LiveScoreGateway], // Khai báo Gateway ở mảng providers
})
export class MatchesModule {}
```

---

## Kiểm thử (Test thử luồng)
1. Chạy Backend: `pnpm start:dev`.
2. Mở công cụ Postman. Chọn New -> WebSocket Request.
3. Nhập URL: `ws://localhost:3000/live` và ấn **Connect**.
4. Gửi một Message lên Server với cú pháp:
   - Event name: `joinRoom`
   - Message: `{"matchId": "12345"}`
5. Nếu nhận được phản hồi `{"event":"joined","data":"match:12345"}`, chứng tỏ Socket.io đã hoạt động hoàn hảo.
