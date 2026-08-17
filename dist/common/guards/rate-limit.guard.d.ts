import { CanActivate, ExecutionContext } from '@nestjs/common';
export declare class RateLimitGuard implements CanActivate {
    private store;
    private readonly maxRequests;
    private readonly windowMs;
    constructor(maxRequests?: number, windowMs?: number, forceLimit?: boolean);
    canActivate(context: ExecutionContext): boolean;
}
