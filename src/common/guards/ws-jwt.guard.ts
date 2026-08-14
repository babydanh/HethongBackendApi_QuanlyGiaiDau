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
            
            let token = client.handshake.auth?.token;
            if (token && typeof token === 'string') {
                if (token.startsWith('Bearer ')) {
                    token = token.substring(7).trim();
                } else {
                    token = token.trim();
                }
            }
            
            if (!token && client.handshake.headers.cookie) {
                const cookieString = client.handshake.headers.cookie;
                const cookies = cookieString.split(';').reduce((acc, cookie) => {
                    const parts = cookie.split('=');
                    const key = parts[0]?.trim();
                    const value = parts.slice(1).join('=')?.trim();
                    if (key && value) {
                        acc[key] = decodeURIComponent(value);
                    }
                    return acc;
                }, {} as Record<string, string>);
                token = cookies['accessToken'];
            }
            
            if (!token && client.handshake.query?.token) {
                token = client.handshake.query.token as string;
            }

            // Flutter's Socket.IO client sends bearer credentials as an
            // Authorization handshake header. Accept it in addition to the
            // browser auth/cookie shapes above so mobile chat is authenticated.
            if (!token) {
                const authorization = client.handshake.headers.authorization;
                if (typeof authorization === 'string' && authorization.trim()) {
                    token = authorization.trim().replace(/^Bearer\s+/i, '').trim();
                }
            }

            if (!token) {
                throw new WsException('Unauthorized');
            }

            const payload = this.jwtService.verify(token);
            client.data.user = payload;

            return true;
        } catch(err) {
            throw new WsException('Invalid token');
        }
    }
}
