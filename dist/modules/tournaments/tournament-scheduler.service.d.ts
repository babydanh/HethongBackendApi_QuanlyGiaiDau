import type { AppDb } from '../../database/db.types';
export declare class TournamentSchedulerService {
    private readonly db;
    private readonly logger;
    constructor(db: AppDb);
    handleAutoCloseRegistration(): Promise<void>;
    handleAutoOpenRegistration(): Promise<void>;
    calculateNextRecurringDate(frequency: string, daysOfWeek: number[] | number, timeOfDay: string, fromDate?: Date): Date;
    handleRecurringLiteTournaments(): Promise<void>;
    handleAutoCleanupAbandonedTournaments(): Promise<void>;
}
