import { AdminService } from './admin.service';
export declare class AdminController {
    private readonly adminService;
    constructor(adminService: AdminService);
    getMetrics(groupBy?: 'day' | 'week' | 'month' | 'year'): Promise<{
        gmv: {
            value: number;
            change: number;
        };
        netRevenue: {
            value: number;
            change: number;
        };
        heldEscrow: {
            value: number;
            change: number;
        };
        transactionsCount: {
            value: number;
            change: number;
        };
        totalUsers: {
            value: number;
            change: number;
        };
        totalCommunities: {
            value: number;
            change: number;
        };
        totalTournaments: {
            value: number;
            change: number;
        };
    }>;
    getRevenueChart(groupBy?: 'day' | 'week' | 'month' | 'year', startDate?: string, endDate?: string): Promise<{
        period: string;
        gmv: number;
        revenue: number;
        count: number;
    }[]>;
    getAuditLogs(page?: string, limit?: string, search?: string, userId?: string, cursor?: string): Promise<{
        data: {
            id: string;
            userId: string | null;
            action: string;
            tableName: string;
            recordId: string;
            oldValues: unknown;
            newValues: unknown;
            ipAddress: string | null;
            userAgent: string | null;
            createdAt: Date;
            user: {
                email: string | null;
                fullName: string | null;
            };
        }[];
        meta: {
            total: number;
            page: number;
            limit: number;
            totalPages: number;
            nextCursor: string | null;
            hasMore: boolean;
        };
    }>;
}
