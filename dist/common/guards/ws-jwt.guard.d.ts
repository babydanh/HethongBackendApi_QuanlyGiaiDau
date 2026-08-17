import { CanActivate, ExecutionContext } from "@nestjs/common";
import { JwtService } from '@nestjs/jwt';
import { Socket } from 'socket.io';
export declare function extractWsToken(client: Socket): string | null;
export declare class WsJwtGuard implements CanActivate {
    private readonly jwtService;
    constructor(jwtService: JwtService);
    canActivate(context: ExecutionContext): Promise<boolean>;
}
