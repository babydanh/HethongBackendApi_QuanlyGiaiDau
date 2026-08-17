import { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AppDb } from '../../database/db.types';
export declare class RolesGuard implements CanActivate {
    private readonly reflector;
    private readonly db;
    constructor(reflector: Reflector, db: AppDb);
    canActivate(context: ExecutionContext): Promise<boolean>;
}
