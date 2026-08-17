import type { InferSelectModel } from 'drizzle-orm';
import { OnGatewayConnection } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import * as schema from '../../database/schema';
export declare class NotificationsGateway implements OnGatewayConnection {
    private readonly jwtService;
    server: Server;
    constructor(jwtService: JwtService);
    handleConnection(client: Socket): void;
    handleSubscribe(client: Socket): {
        event: string;
        data: string;
    };
    pushNotification(userId: string, notification: InferSelectModel<typeof schema.notifications>): void;
    private getAuthenticatedUserId;
    private getUserRoom;
}
