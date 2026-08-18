import { SeriesService } from './series.service';
import { CreateSeriesDto } from './dto/create-series.dto';
import { UpdateSeriesDto } from './dto/update-series.dto';
import { QuerySeriesDto } from './dto/query-series.dto';
import { CreateLegDto, LinkEventDto } from './dto/leg.dto';
import { QueryStandingsDto } from './dto/query-standings.dto';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
export declare class SeriesController {
    private readonly seriesService;
    constructor(seriesService: SeriesService);
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
    findOne(slug: string): Promise<any>;
    findLegs(id: string): Promise<{
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
    findEvents(id: string, legId: string): Promise<{
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
    getStandings(id: string, query: QueryStandingsDto): Promise<{
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
    getFinalsQualifiers(id: string, legId: string, categoryId: string): Promise<{
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
export declare class OrganizerSeriesController {
    private readonly seriesService;
    constructor(seriesService: SeriesService);
    create(data: CreateSeriesDto, user: JwtPayload): Promise<{
        id: string;
        name: string;
        description: string | null;
        bannerUrl: string | null;
        logoUrl: string | null;
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
    update(id: string, data: UpdateSeriesDto, user: JwtPayload): Promise<{
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
    remove(id: string, user: JwtPayload): Promise<{
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
    createLeg(id: string, data: CreateLegDto, user: JwtPayload): Promise<{
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
    updateLeg(id: string, legId: string, data: Partial<CreateLegDto> & {
        status?: 'UPCOMING' | 'ONGOING' | 'COMPLETED';
    }, user: JwtPayload): Promise<{
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
    deleteLeg(id: string, legId: string, user: JwtPayload): Promise<{
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
    linkTournament(id: string, legId: string, data: LinkEventDto, user: JwtPayload): Promise<{
        id: string;
        createdAt: Date;
        tournamentId: string;
        order: number;
        region: string | null;
        legId: string;
        pointMultiplier: number;
    }>;
    unlinkTournament(id: string, legId: string, eventId: string, user: JwtPayload): Promise<{
        id: string;
        createdAt: Date;
        tournamentId: string;
        order: number;
        region: string | null;
        legId: string;
        pointMultiplier: number;
    }>;
    resetSeason(id: string, user: JwtPayload): Promise<{
        success: boolean;
        message: string;
    }>;
}
