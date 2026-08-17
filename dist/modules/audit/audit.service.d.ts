import type { AppDb, AppTx } from '../../database/db.types';
export type Transaction = AppTx;
export declare class AuditService {
    private readonly db;
    constructor(db: AppDb);
    logCreate(tx: Transaction, userId: string | null, tableName: string, recordId: string, newValues: Record<string, unknown>, ipAddress?: string, userAgent?: string): Promise<void>;
    logUpdate(tx: Transaction, userId: string | null, tableName: string, recordId: string, oldValues: Record<string, unknown>, newValues: Record<string, unknown>, ipAddress?: string, userAgent?: string): Promise<void>;
    logDelete(tx: Transaction, userId: string | null, tableName: string, recordId: string, oldValues: Record<string, unknown>, ipAddress?: string, userAgent?: string): Promise<void>;
}
