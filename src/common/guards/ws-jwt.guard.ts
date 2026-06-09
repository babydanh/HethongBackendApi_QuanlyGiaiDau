import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { JwtService } from '@nestjs/jwt';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';

@Injectable()
export class WsJwtGuard implements CanActivate {
    constructor(private readonly jwtService: JwtService) {}

    async canActivate(context: ExecutionContext): Promise<boolean>
    {
        try {
            const client: Socket = context.switchToWs().getClient<Socket>();
            
            const token = client.handshake.auth?.token?.split(' ')[1];
            
            if (!token) {
                throw new WsException('Unauthorized')
            }

            const payload = this.jwtService.verify(token);
            client.data.user = payload;

            return true;
        }catch(err) {
            throw new WsException('Invalid token');
        }
    }
}