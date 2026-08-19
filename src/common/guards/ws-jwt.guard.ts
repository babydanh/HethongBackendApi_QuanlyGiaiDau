import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { JwtService } from '@nestjs/jwt';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';

export function extractWsToken(
    client: Socket,
    options: { allowQueryToken?: boolean } = {},
): string | null {
    let token = client.handshake.auth?.token;
    if (typeof token === 'string' && token.trim()) {
        return token.trim().replace(/^Bearer\s+/i, '').trim();
    }

    if (client.handshake.headers.cookie) {
        const cookies = client.handshake.headers.cookie.split(';').reduce((acc, cookie) => {
            const parts = cookie.split('=');
            const key = parts[0]?.trim();
            const value = parts.slice(1).join('=')?.trim();
            if (key && value) acc[key] = decodeURIComponent(value);
            return acc;
        }, {} as Record<string, string>);
        if (cookies.accessToken) return cookies.accessToken;
    }

    if (options.allowQueryToken !== false) {
        const queryToken = client.handshake.query?.token;
        if (typeof queryToken === 'string' && queryToken.trim()) {
            return queryToken.trim().replace(/^Bearer\s+/i, '').trim();
        }
    }

    const authorization = client.handshake.headers.authorization;
    if (typeof authorization === 'string' && authorization.trim()) {
        return authorization.trim().replace(/^Bearer\s+/i, '').trim();
    }

    return null;
}

@Injectable()
export class WsJwtGuard implements CanActivate {
    constructor(private readonly jwtService: JwtService) {}

    async canActivate(context: ExecutionContext): Promise<boolean>
    {
        try {
            const client: Socket = context.switchToWs().getClient<Socket>();
            
            const token = extractWsToken(client);

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
