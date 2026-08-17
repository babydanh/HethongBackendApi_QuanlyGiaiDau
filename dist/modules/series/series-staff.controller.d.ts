import { SeriesService } from './series.service';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
export declare class SeriesInvitationsController {
    private readonly seriesService;
    constructor(seriesService: SeriesService);
    acceptInvitation(id: string, user: JwtPayload): Promise<{
        id: string;
        createdAt: Date;
        userId: string;
        role: string;
        seriesId: string;
    }>;
    rejectInvitation(id: string, user: JwtPayload): Promise<{
        id: string;
        seriesId: string;
        email: string | null;
        phone: string | null;
        role: string;
        status: string;
        createdAt: Date;
    }>;
}
export declare class OrganizerSeriesStaffController {
    private readonly seriesService;
    constructor(seriesService: SeriesService);
    inviteStaff(id: string, body: {
        emailOrPhone: string;
        role: 'CO_ORGANIZER' | 'REFEREE' | 'CLERK';
    }, user: JwtPayload): Promise<{
        id: string;
        email: string | null;
        createdAt: Date;
        status: string;
        role: string;
        seriesId: string;
        phone: string | null;
    }>;
    listInvitations(id: string, user: JwtPayload): Promise<{
        id: string;
        seriesId: string;
        email: string | null;
        phone: string | null;
        role: string;
        status: string;
        createdAt: Date;
    }[]>;
    listManagers(id: string): Promise<{
        manager: {
            id: string;
            seriesId: string;
            userId: string;
            role: string;
            createdAt: Date;
        };
        user: {
            id: string;
            email: string;
            fullName: string;
            avatarUrl: string | null;
        };
    }[]>;
    revokeManager(id: string, userIdToRevoke: string, user: JwtPayload): Promise<{
        id: string;
        createdAt: Date;
        userId: string;
        role: string;
        seriesId: string;
    }>;
}
