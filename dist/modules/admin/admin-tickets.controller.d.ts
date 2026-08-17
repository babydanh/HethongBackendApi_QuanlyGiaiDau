import { AdminService } from './admin.service';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { SubmitTicketDto, RejectTicketDto } from './dto/admin.dto';
export declare class AdminTicketsController {
    private readonly adminService;
    constructor(adminService: AdminService);
    submit(user: JwtPayload, dto: SubmitTicketDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        status: string;
        evidenceUrls: string[];
        contactPhone: string;
        rejectReason: string | null;
        reviewedBy: string | null;
    }>;
    getMyTickets(user: JwtPayload): Promise<{
        id: string;
        userId: string;
        evidenceUrls: string[];
        contactPhone: string;
        status: string;
        rejectReason: string | null;
        reviewedBy: string | null;
        createdAt: Date;
        updatedAt: Date;
    }[]>;
    list(status?: string, page?: string, limit?: string, cursor?: string): Promise<{
        data: {
            ticket: {
                id: string;
                userId: string;
                evidenceUrls: string[];
                contactPhone: string;
                status: string;
                rejectReason: string | null;
                reviewedBy: string | null;
                createdAt: Date;
                updatedAt: Date;
            };
            user: {
                email: string;
                fullName: string;
                avatarUrl: string | null;
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
    approve(admin: JwtPayload, id: string): Promise<{
        id: string;
        userId: string;
        evidenceUrls: string[];
        contactPhone: string;
        status: string;
        rejectReason: string | null;
        reviewedBy: string | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    reject(admin: JwtPayload, id: string, dto: RejectTicketDto): Promise<{
        id: string;
        userId: string;
        evidenceUrls: string[];
        contactPhone: string;
        status: string;
        rejectReason: string | null;
        reviewedBy: string | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
}
