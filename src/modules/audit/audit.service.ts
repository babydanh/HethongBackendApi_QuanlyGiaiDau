import { Injectable, Inject } from '@nestjs/common';
import { PG_CONNECTION } from '../../database/database.module';
import type { AppDb, AppTx } from '../../database/db.types';
import * as schema from '../../database/schema';

// Helper type for transaction
export type Transaction = AppTx;

@Injectable()
export class AuditService {
  constructor(
    @Inject(PG_CONNECTION) private readonly db: AppDb,
  ) {}

  async logCreate(
    tx: Transaction,
    userId: string | null,
    tableName: string,
    recordId: string,
    newValues: Record<string, unknown>,
    ipAddress?: string,
    userAgent?: string,
  ) {
    await tx.insert(schema.auditLogs).values({
      userId,
      action: 'CREATE',
      tableName,
      recordId,
      oldValues: null,
      newValues,
      ipAddress,
      userAgent,
    });
  }

  async logUpdate(
    tx: Transaction,
    userId: string | null,
    tableName: string,
    recordId: string,
    oldValues: Record<string, unknown>,
    newValues: Record<string, unknown>,
    ipAddress?: string,
    userAgent?: string,
  ) {
    await tx.insert(schema.auditLogs).values({
      userId,
      action: 'UPDATE',
      tableName,
      recordId,
      oldValues,
      newValues,
      ipAddress,
      userAgent,
    });
  }

  async logDelete(
    tx: Transaction,
    userId: string | null,
    tableName: string,
    recordId: string,
    oldValues: Record<string, unknown>,
    ipAddress?: string,
    userAgent?: string,
  ) {
    await tx.insert(schema.auditLogs).values({
      userId,
      action: 'DELETE',
      tableName,
      recordId,
      oldValues,
      newValues: null,
      ipAddress,
      userAgent,
    });
  }
}

