import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AccountSanctionService } from '../services/account-sanction.service';
export declare class AccountBanGuard {
    private readonly reflector;
    private readonly accountSanctionService;
    constructor(reflector: Reflector, accountSanctionService: AccountSanctionService);
    canActivate(context: ExecutionContext): Promise<boolean>;
}
