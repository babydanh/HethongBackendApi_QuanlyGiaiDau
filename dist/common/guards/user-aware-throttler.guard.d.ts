import { ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
export declare class UserAwareThrottlerGuard extends ThrottlerGuard {
    protected shouldSkip(context: ExecutionContext): Promise<boolean>;
    protected getTracker(req: Record<string, any>): Promise<string>;
}
