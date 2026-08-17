import type { AppDb } from '../../database/db.types';
import * as schema from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import { QueryCommunityDto } from './dto/query-community.dto';
export declare class CommunitiesRepository {
    private readonly db;
    private readonly auditService;
    constructor(db: AppDb, auditService: AuditService);
    findAll(query: QueryCommunityDto): Promise<{
        data: {
            categories: unknown[];
            _count: {
                members: number;
                tournaments: number;
            };
            id: string;
            name: string;
            description: string | null;
            logoUrl: string | null;
            bannerUrl: string | null;
            creatorId: string;
            provinceCode: string | null;
            districtCode: string | null;
            wardCode: string | null;
            visibility: string;
            joinMode: string;
            joinQuestions: string[];
            rules: string | null;
            maxMembers: number | null;
            status: string;
            approvedBy: string | null;
            rejectedReason: string | null;
            reviewedAt: Date | null;
            locationGeolocation: string | null;
            locationAddress: string | null;
            socialLinks: {
                facebook?: string;
                zalo?: string;
                website?: string;
            } | null;
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
    findMyCommunities(userId: string): Promise<{
        created: {
            myRole: string;
            id: string;
            name: string;
            description: string | null;
            logoUrl: string | null;
            bannerUrl: string | null;
            creatorId: string;
            provinceCode: string | null;
            districtCode: string | null;
            wardCode: string | null;
            visibility: string;
            joinMode: string;
            joinQuestions: string[];
            rules: string | null;
            maxMembers: number | null;
            status: string;
            approvedBy: string | null;
            rejectedReason: string | null;
            reviewedAt: Date | null;
            locationGeolocation: string | null;
            locationAddress: string | null;
            socialLinks: {
                facebook?: string;
                zalo?: string;
                website?: string;
            } | null;
            createdAt: Date;
            updatedAt: Date;
            deletedAt: Date | null;
        }[];
        joined: {
            myRole: string;
            id: string;
            name: string;
            description: string | null;
            logoUrl: string | null;
            bannerUrl: string | null;
            creatorId: string;
            provinceCode: string | null;
            districtCode: string | null;
            wardCode: string | null;
            visibility: string;
            joinMode: string;
            joinQuestions: string[];
            rules: string | null;
            maxMembers: number | null;
            status: string;
            approvedBy: string | null;
            rejectedReason: string | null;
            reviewedAt: Date | null;
            locationGeolocation: string | null;
            locationAddress: string | null;
            socialLinks: {
                facebook?: string;
                zalo?: string;
                website?: string;
            } | null;
            createdAt: Date;
            updatedAt: Date;
            deletedAt: Date | null;
        }[];
    }>;
    findById(id: string): Promise<{
        categories: {
            id: string;
            name: string;
            slug: string;
            description: string | null;
            categoryConfig: unknown;
        }[];
        _count: {
            members: number;
            tournaments: number;
        };
        id: string;
        name: string;
        description: string | null;
        logoUrl: string | null;
        bannerUrl: string | null;
        creatorId: string;
        provinceCode: string | null;
        districtCode: string | null;
        wardCode: string | null;
        visibility: string;
        joinMode: string;
        joinQuestions: string[];
        rules: string | null;
        maxMembers: number | null;
        status: string;
        approvedBy: string | null;
        rejectedReason: string | null;
        reviewedAt: Date | null;
        locationGeolocation: string | null;
        locationAddress: string | null;
        socialLinks: {
            facebook?: string;
            zalo?: string;
            website?: string;
        } | null;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
    } | null>;
    create(data: Omit<typeof schema.communities.$inferInsert, 'locationGeolocation'>, lat?: number, lng?: number, categoryIds?: string[]): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
        description: string | null;
        provinceCode: string | null;
        logoUrl: string | null;
        bannerUrl: string | null;
        creatorId: string;
        districtCode: string | null;
        wardCode: string | null;
        visibility: string;
        joinMode: string;
        joinQuestions: string[];
        rules: string | null;
        maxMembers: number | null;
        status: string;
        approvedBy: string | null;
        rejectedReason: string | null;
        reviewedAt: Date | null;
        locationGeolocation: string | null;
        locationAddress: string | null;
        socialLinks: {
            facebook?: string;
            zalo?: string;
            website?: string;
        } | null;
    }>;
    update(id: string, data: Partial<typeof schema.communities.$inferInsert>, lat?: number, lng?: number, categoryIds?: string[]): Promise<{
        id: string;
        name: string;
        description: string | null;
        logoUrl: string | null;
        bannerUrl: string | null;
        creatorId: string;
        provinceCode: string | null;
        districtCode: string | null;
        wardCode: string | null;
        visibility: string;
        joinMode: string;
        joinQuestions: string[];
        rules: string | null;
        maxMembers: number | null;
        status: string;
        approvedBy: string | null;
        rejectedReason: string | null;
        reviewedAt: Date | null;
        locationGeolocation: string | null;
        locationAddress: string | null;
        socialLinks: {
            facebook?: string;
            zalo?: string;
            website?: string;
        } | null;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
    }>;
    delete(id: string): Promise<{
        id: string;
        name: string;
        description: string | null;
        logoUrl: string | null;
        bannerUrl: string | null;
        creatorId: string;
        provinceCode: string | null;
        districtCode: string | null;
        wardCode: string | null;
        visibility: string;
        joinMode: string;
        joinQuestions: string[];
        rules: string | null;
        maxMembers: number | null;
        status: string;
        approvedBy: string | null;
        rejectedReason: string | null;
        reviewedAt: Date | null;
        locationGeolocation: string | null;
        locationAddress: string | null;
        socialLinks: {
            facebook?: string;
            zalo?: string;
            website?: string;
        } | null;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
    }>;
    findMember(communityId: string, userId: string): Promise<{
        id: string;
        communityId: string;
        userId: string;
        role: string;
        status: string;
        invitedBy: string | null;
        joinAnswers: Record<string, string> | null;
        tags: string[];
        notificationPreference: string;
        approvedBy: string | null;
        approvedAt: Date | null;
        joinedAt: Date;
    }>;
    findMyMembership(userId: string, communityId: string): Promise<{
        id: string;
        communityId: string;
        userId: string;
        role: string;
        status: string;
        invitedBy: string | null;
        joinAnswers: Record<string, string> | null;
        tags: string[];
        notificationPreference: string;
        approvedBy: string | null;
        approvedAt: Date | null;
        joinedAt: Date;
    }>;
    getMembers(communityId: string, query?: {
        status?: string;
        page?: number;
        limit?: number;
        cursor?: string;
        search?: string;
        mentionable?: boolean;
    }): Promise<{
        data: {
            member: {
                id: string;
                communityId: string;
                userId: string;
                role: string;
                status: string;
                invitedBy: string | null;
                joinAnswers: Record<string, string> | null;
                tags: string[];
                notificationPreference: string;
                approvedBy: string | null;
                approvedAt: Date | null;
                joinedAt: Date;
            };
            user: {
                id: string;
                fullName: string | null;
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
    findInvitesByUser(userId: string): Promise<{
        inviterName: string;
        inviterAvatar: string | null;
        createdAt: Date;
        status: string;
        id: string;
        communityId: string;
        communityName: string;
        communityAvatar: string | null;
        communityLogoUrl: string | null;
        communityBannerUrl: string | null;
        role: string;
        invitedAt: Date;
    }[]>;
    addMember(communityId: string, userId: string, role: string, status?: string, joinAnswers?: Record<string, string>, invitedBy?: string): Promise<{
        id: string;
        userId: string;
        status: string;
        approvedBy: string | null;
        communityId: string;
        role: string;
        invitedBy: string | null;
        joinAnswers: Record<string, string> | null;
        tags: string[];
        notificationPreference: string;
        approvedAt: Date | null;
        joinedAt: Date;
    }>;
    updateMemberStatus(communityId: string, userId: string, status: string, approvedBy?: string): Promise<{
        id: string;
        communityId: string;
        userId: string;
        role: string;
        status: string;
        invitedBy: string | null;
        joinAnswers: Record<string, string> | null;
        tags: string[];
        notificationPreference: string;
        approvedBy: string | null;
        approvedAt: Date | null;
        joinedAt: Date;
    }>;
    updateMemberRole(communityId: string, userId: string, role: string): Promise<{
        id: string;
        communityId: string;
        userId: string;
        role: string;
        status: string;
        invitedBy: string | null;
        joinAnswers: Record<string, string> | null;
        tags: string[];
        notificationPreference: string;
        approvedBy: string | null;
        approvedAt: Date | null;
        joinedAt: Date;
    }>;
    updateMemberTags(communityId: string, userId: string, tags: string[], actorId: string): Promise<{
        id: string;
        communityId: string;
        userId: string;
        role: string;
        status: string;
        invitedBy: string | null;
        joinAnswers: Record<string, string> | null;
        tags: string[];
        notificationPreference: string;
        approvedBy: string | null;
        approvedAt: Date | null;
        joinedAt: Date;
    } | null>;
    transferOwnership(communityId: string, currentOwnerId: string, newOwnerId: string): Promise<{
        id: string;
        communityId: string;
        userId: string;
        role: string;
        status: string;
        invitedBy: string | null;
        joinAnswers: Record<string, string> | null;
        tags: string[];
        notificationPreference: string;
        approvedBy: string | null;
        approvedAt: Date | null;
        joinedAt: Date;
    }>;
    removeMember(communityId: string, userId: string): Promise<{
        id: string;
        userId: string;
        status: string;
        approvedBy: string | null;
        communityId: string;
        role: string;
        invitedBy: string | null;
        joinAnswers: Record<string, string> | null;
        tags: string[];
        notificationPreference: string;
        approvedAt: Date | null;
        joinedAt: Date;
    }>;
    addFollow(communityId: string, userId: string, type: 'FOLLOW' | 'FAVORITE'): Promise<{
        id: string;
        createdAt: Date;
        userId: string;
        type: string;
        communityId: string;
    }>;
    removeFollow(communityId: string, userId: string, type: 'FOLLOW' | 'FAVORITE'): Promise<{
        id: string;
        createdAt: Date;
        userId: string;
        type: string;
        communityId: string;
    }>;
    getFavorites(userId: string): Promise<{
        community: {
            id: string;
            name: string;
            description: string | null;
            logoUrl: string | null;
            bannerUrl: string | null;
            creatorId: string;
            provinceCode: string | null;
            districtCode: string | null;
            wardCode: string | null;
            visibility: string;
            joinMode: string;
            joinQuestions: string[];
            rules: string | null;
            maxMembers: number | null;
            status: string;
            approvedBy: string | null;
            rejectedReason: string | null;
            reviewedAt: Date | null;
            locationGeolocation: string | null;
            locationAddress: string | null;
            socialLinks: {
                facebook?: string;
                zalo?: string;
                website?: string;
            } | null;
            createdAt: Date;
            updatedAt: Date;
            deletedAt: Date | null;
        };
    }[]>;
    getGallery(communityId: string): Promise<{
        id: string;
        communityId: string;
        uploaderId: string | null;
        imageUrl: string;
        caption: string | null;
        createdAt: Date;
    }[]>;
    findGalleryItemById(communityId: string, imageId: string): Promise<{
        id: string;
        communityId: string;
        uploaderId: string | null;
        imageUrl: string;
        caption: string | null;
        createdAt: Date;
    }>;
    addGalleryItem(communityId: string, uploaderId: string, imageUrl: string, caption?: string): Promise<{
        id: string;
        createdAt: Date;
        communityId: string;
        imageUrl: string;
        uploaderId: string | null;
        caption: string | null;
    }>;
    getTournaments(communityId: string, status?: string): Promise<{
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
    }[]>;
    getRankings(communityId: string, limit?: number): Promise<{
        rank: {
            id: string;
            communityId: string;
            userId: string;
            categoryId: string;
            matchType: string;
            genderRestriction: string | null;
            eloPoints: number;
            matchesPlayed: number;
            matchesWon: number;
            winStreak: number;
            peakElo: number;
            lastActiveAt: Date;
            lastDecayAt: Date;
            updatedAt: Date;
        };
        user: {
            id: string;
            fullName: string | null;
            avatarUrl: string | null;
        };
    }[]>;
    getRecentMatches(communityId: string, limit?: number): Promise<{
        id: string;
        playerA: {
            id: string;
            fullName: string;
            avatarUrl: string | null;
        } | null;
        playerB: {
            id: string;
            fullName: string;
            avatarUrl: string | null;
        } | null;
        scoreA: number;
        scoreB: number;
        status: string;
        eloDelta: number;
        playedAt: Date | null;
    }[]>;
    getUpcomingMatches(communityId: string, limit?: number): Promise<{
        id: string;
        playerA: {
            id: string;
            fullName: string;
            avatarUrl: string | null;
        } | null;
        playerB: {
            id: string;
            fullName: string;
            avatarUrl: string | null;
        } | null;
        scheduledAt: Date | null;
    }[]>;
    getFeaturedTournament(communityId: string): Promise<{
        id: string;
        name: string;
        status: string;
        participantCount: number;
        championName: string | null;
    } | null>;
    getTopRanked(communityId: string, limit?: number): Promise<{
        rank: number;
        userId: string;
        fullName: string | null;
        avatarUrl: string | null;
        elo: number;
        tierName: string | null;
        winStreak: number;
    }[]>;
    getActivityFeed(communityId: string, limit?: number): Promise<({
        type: "MEMBER_JOINED";
        userId: string;
        userName: string;
        message: string;
        at: Date;
    } | {
        type: "GALLERY_ADDED";
        userId: string | null;
        userName: string;
        message: string;
        at: Date;
    } | {
        type: "TOURNAMENT_CREATED";
        userId: string;
        userName: string;
        message: string;
        at: Date;
    })[]>;
    private findMatchPlayers;
    private groupMatchPlayers;
    private toDashboardPlayer;
    private findTournamentChampionName;
    removeGalleryItem(communityId: string, imageId: string): Promise<{
        id: string;
        createdAt: Date;
        communityId: string;
        imageUrl: string;
        uploaderId: string | null;
        caption: string | null;
    }>;
    getMatchResultStreaks(communityId: string, userIds: string[]): Promise<Array<{
        userId: string;
        won: boolean;
        streak: number;
    }>>;
    getWeeklyEloGains(communityId: string, userIds: string[]): Promise<Array<{
        userId: string;
        gain: number;
    }>>;
    countActiveByCreator(creatorId: string): Promise<number>;
    listTagPresets(communityId: string): Promise<{
        id: string;
        communityId: string;
        name: string;
        color: string;
        createdBy: string | null;
        createdAt: Date;
    }[]>;
    createTagPreset(communityId: string, createdBy: string, name: string, color: string): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        communityId: string;
        createdBy: string | null;
        color: string;
    }>;
    findTagPresetByName(communityId: string, name: string): Promise<{
        id: string;
    }>;
    deleteTagPreset(communityId: string, presetId: string): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        communityId: string;
        createdBy: string | null;
        color: string;
    }>;
    updateMemberNotificationPreference(communityId: string, userId: string, preference: 'ALL' | 'MENTIONS_ONLY' | 'MUTED'): Promise<{
        id: string;
        communityId: string;
        userId: string;
        role: string;
        status: string;
        invitedBy: string | null;
        joinAnswers: Record<string, string> | null;
        tags: string[];
        notificationPreference: string;
        approvedBy: string | null;
        approvedAt: Date | null;
        joinedAt: Date;
    }>;
    getMyNotificationPreferences(userId: string): Promise<{
        communityId: string;
        communityName: string;
        logoUrl: string | null;
        role: string;
        notificationPreference: string;
    }[]>;
}
