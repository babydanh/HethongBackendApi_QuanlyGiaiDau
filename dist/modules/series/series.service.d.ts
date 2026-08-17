import { SeriesRepository } from './series.repository';
import { CreateSeriesDto } from './dto/create-series.dto';
import { UpdateSeriesDto } from './dto/update-series.dto';
import { QuerySeriesDto } from './dto/query-series.dto';
import { CreateLegDto, LinkEventDto } from './dto/leg.dto';
export declare class SeriesService {
    private readonly seriesRepository;
    constructor(seriesRepository: SeriesRepository);
    create(userId: string, data: CreateSeriesDto): Promise<{
        id: string;
        name: string;
        description: string | null;
        logoUrl: string | null;
        bannerUrl: string | null;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
        visibility: string;
        rules: unknown;
        status: string;
        slug: string;
        startDate: Date | null;
        endDate: Date | null;
        organizerId: string;
        totalPrize: string | null;
    }>;
    update(id: string, userId: string, data: UpdateSeriesDto, roles: string[]): Promise<{
        id: string;
        name: string;
        slug: string;
        description: string | null;
        bannerUrl: string | null;
        logoUrl: string | null;
        organizerId: string;
        status: string;
        startDate: Date | null;
        endDate: Date | null;
        totalPrize: string | null;
        rules: unknown;
        visibility: string;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
    }>;
    remove(id: string, userId: string, roles: string[]): Promise<{
        id: string;
        name: string;
        slug: string;
        description: string | null;
        bannerUrl: string | null;
        logoUrl: string | null;
        organizerId: string;
        status: string;
        startDate: Date | null;
        endDate: Date | null;
        totalPrize: string | null;
        rules: unknown;
        visibility: string;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
    }>;
    findOne(idOrSlug: string): Promise<any>;
    findAll(query: QuerySeriesDto): Promise<{
        data: {
            id: string;
            name: string;
            slug: string;
            description: string | null;
            bannerUrl: string | null;
            logoUrl: string | null;
            organizerId: string;
            status: string;
            startDate: Date | null;
            endDate: Date | null;
            totalPrize: string | null;
            rules: unknown;
            visibility: string;
            createdAt: Date;
            updatedAt: Date;
            deletedAt: Date | null;
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
    createLeg(seriesId: string, userId: string, data: CreateLegDto, roles: string[]): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        status: string;
        startDate: Date | null;
        endDate: Date | null;
        order: number;
        seriesId: string;
        directEntrySlots: number;
        wildcardSlots: number;
        rulesOverride: unknown;
    }>;
    updateLeg(seriesId: string, legId: string, userId: string, data: Partial<CreateLegDto> & {
        status?: 'UPCOMING' | 'ONGOING' | 'COMPLETED';
    }, roles: string[]): Promise<{
        id: string;
        seriesId: string;
        name: string;
        order: number;
        startDate: Date | null;
        endDate: Date | null;
        status: string;
        directEntrySlots: number;
        wildcardSlots: number;
        rulesOverride: unknown;
        createdAt: Date;
    }>;
    deleteLeg(seriesId: string, legId: string, userId: string, roles: string[]): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        status: string;
        startDate: Date | null;
        endDate: Date | null;
        order: number;
        seriesId: string;
        directEntrySlots: number;
        wildcardSlots: number;
        rulesOverride: unknown;
    }>;
    findLegs(seriesId: string): Promise<{
        id: string;
        seriesId: string;
        name: string;
        order: number;
        startDate: Date | null;
        endDate: Date | null;
        status: string;
        directEntrySlots: number;
        wildcardSlots: number;
        rulesOverride: unknown;
        createdAt: Date;
    }[]>;
    linkTournament(seriesId: string, legId: string, userId: string, data: LinkEventDto, roles: string[]): Promise<{
        id: string;
        createdAt: Date;
        tournamentId: string;
        order: number;
        legId: string;
        region: string | null;
        pointMultiplier: number;
    }>;
    unlinkTournament(seriesId: string, eventId: string, userId: string, roles: string[]): Promise<{
        id: string;
        createdAt: Date;
        tournamentId: string;
        order: number;
        legId: string;
        region: string | null;
        pointMultiplier: number;
    }>;
    findEvents(legId: string): Promise<{
        event: {
            id: string;
            legId: string;
            tournamentId: string;
            region: string | null;
            order: number;
            pointMultiplier: number;
            createdAt: Date;
        };
        tournament: {
            id: string;
            parentId: string | null;
            communityId: string | null;
            categoryId: string;
            createdBy: string;
            name: string;
            description: string | null;
            status: string;
            matchType: string;
            sportRules: unknown;
            tournamentConfig: unknown;
            entryFee: string;
            platformFeePercentage: string;
            registrationStartDate: Date | null;
            registrationEndDate: Date | null;
            maxParticipants: number | null;
            startDate: Date | null;
            endDate: Date | null;
            venueId: string | null;
            tournamentType: string;
            bannerUrl: string | null;
            logoUrl: string | null;
            galleryImages: string[];
            prizeDescription: string | null;
            prizes: unknown;
            inviteCode: string | null;
            visibility: string;
            genderRestriction: string | null;
            contactInfo: unknown;
            city: string | null;
            reservedSlotsCount: number;
            isRanked: boolean;
            isRegistrationLocked: boolean;
            createdAt: Date;
            updatedAt: Date;
            archivedAt: Date | null;
            deletedAt: Date | null;
        };
    }[]>;
    getStandings(seriesId: string, query: {
        legId: string;
        categoryId?: string;
        limit?: number;
        page?: number;
        cursor?: string;
    }): Promise<{
        data: {
            standing: {
                id: string;
                legId: string;
                userId: string;
                categoryId: string;
                totalPsrPoints: number;
                eventsPlayed: number;
                bestRank: number | null;
                directEntry: boolean;
                wildcardEntry: boolean;
                lockedOut: boolean;
                qualifiedEventId: string | null;
                updatedAt: Date;
            };
            user: {
                id: string;
                fullName: string;
                avatarUrl: string | null;
                email: string;
            };
            category: {
                id: string;
                name: string;
                slug: string;
                description: string | null;
                categoryConfig: unknown;
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
    computePsrForTournament(tournamentId: string): Promise<void>;
    resetSeason(seriesId: string, userId: string, userRoles: string[]): Promise<{
        success: boolean;
        message: string;
    }>;
    inviteStaff(seriesId: string, userId: string, inviteeEmailOrPhone: string, role: 'CO_ORGANIZER' | 'REFEREE' | 'CLERK', userRoles: string[]): Promise<{
        id: string;
        email: string | null;
        createdAt: Date;
        status: string;
        role: string;
        seriesId: string;
        phone: string | null;
    }>;
    listInvitations(seriesId: string, userId: string, userRoles: string[]): Promise<{
        id: string;
        seriesId: string;
        email: string | null;
        phone: string | null;
        role: string;
        status: string;
        createdAt: Date;
    }[]>;
    acceptInvitation(invitationId: string, currentUser: {
        email?: string;
        phoneNumber?: string;
        sub?: string;
        id?: string;
    }): Promise<{
        id: string;
        createdAt: Date;
        userId: string;
        role: string;
        seriesId: string;
    }>;
    rejectInvitation(invitationId: string, currentUser: {
        email?: string;
        phoneNumber?: string;
        sub?: string;
        id?: string;
    }): Promise<{
        id: string;
        seriesId: string;
        email: string | null;
        phone: string | null;
        role: string;
        status: string;
        createdAt: Date;
    }>;
    revokeManager(seriesId: string, managerUserId: string, userId: string, userRoles: string[]): Promise<{
        id: string;
        createdAt: Date;
        userId: string;
        role: string;
        seriesId: string;
    }>;
    listManagers(seriesId: string): Promise<{
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
    calculateTourFinalsQualifiers(seriesId: string, legId: string, categoryId: string): Promise<{
        directQualifiers: {
            standing: {
                id: string;
                legId: string;
                userId: string;
                categoryId: string;
                totalPsrPoints: number;
                eventsPlayed: number;
                bestRank: number | null;
                directEntry: boolean;
                wildcardEntry: boolean;
                lockedOut: boolean;
                qualifiedEventId: string | null;
                updatedAt: Date;
            };
            user: {
                id: string;
                fullName: string;
                avatarUrl: string | null;
                email: string;
            };
        }[];
        wildcardQualifiers: {
            standing: {
                id: string;
                legId: string;
                userId: string;
                categoryId: string;
                totalPsrPoints: number;
                eventsPlayed: number;
                bestRank: number | null;
                directEntry: boolean;
                wildcardEntry: boolean;
                lockedOut: boolean;
                qualifiedEventId: string | null;
                updatedAt: Date;
            };
            user: {
                id: string;
                fullName: string;
                avatarUrl: string | null;
                email: string;
            };
        }[];
        rollDownDetails: {
            totalEventDirectSlots: number;
            actualDirectQualifiers: number;
            unusedSlots: number;
            initialWildcardSlots: number;
            finalWildcardSlots: number;
        };
    }>;
}
