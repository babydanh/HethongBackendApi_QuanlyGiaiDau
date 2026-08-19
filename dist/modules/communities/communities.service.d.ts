import { CommunitiesRepository } from './communities.repository';
import { CreateCommunityDto } from './dto/create-community.dto';
import { UpdateCommunityDto } from './dto/update-community.dto';
import { QueryCommunityDto } from './dto/query-community.dto';
import { ReviewCommunityDto } from './dto/review-community.dto';
import { AddMemberDto } from './dto/add-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { StorageService } from '../../providers/storage/storage.service';
type CommunityMemberRole = 'OWNER' | 'MODERATOR' | 'MEMBER';
type CommunityViewer = {
    id: string;
    roles?: string[];
};
export declare class CommunitiesService {
    private readonly communitiesRepository;
    private readonly notificationsService;
    private readonly storageService;
    private readonly logger;
    constructor(communitiesRepository: CommunitiesRepository, notificationsService: NotificationsService, storageService: StorageService);
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
    getMyInvites(userId: string): Promise<{
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
    getDashboard(idOrSlug: string, viewer?: CommunityViewer): Promise<{
        access: {
            visibility: string;
            isAuthenticated: boolean;
            isMember: boolean;
            membershipStatus: string | null;
            membershipRole: string | null;
            isAdmin: boolean;
            canViewContent: boolean;
            canViewFeed: boolean;
            canViewMembers: boolean;
            canPost: boolean;
        };
        recentMatches: {
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
        }[];
        featuredTournament: {
            id: string;
            name: string;
            status: string;
            participantCount: number;
            championName: string | null;
        } | null;
        topPlayers: {
            rank: number;
            userId: string;
            fullName: string | null;
            avatarUrl: string | null;
            elo: number;
            tierName: string | null;
            winStreak: number;
        }[];
        activity: ({
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
        })[];
        upcomingMatches: {
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
        }[];
    }>;
    getMyMembership(userId: string, idOrSlug: string): Promise<{
        role: string;
        status: string;
        memberId: string;
        joinedAt: Date;
        joinAnswers: Record<string, string> | null;
    }>;
    findById(id: string, user?: {
        id: string;
        roles: string[];
    }): Promise<{
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
    }>;
    getPublicView(id: string, viewer?: CommunityViewer): Promise<{
        access: {
            visibility: string;
            isAuthenticated: boolean;
            isMember: boolean;
            membershipStatus: string | null;
            membershipRole: string | null;
            isAdmin: boolean;
            canViewContent: boolean;
            canViewFeed: boolean;
            canViewMembers: boolean;
            canPost: boolean;
        };
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
    } | {
        id: string;
        name: string;
        logoUrl: string | null;
        bannerUrl: string | null;
        visibility: string;
        joinMode: string;
        status: string;
        provinceCode: string | null;
        categories: {
            id: string;
            name: string;
            slug: string;
            description: string | null;
            categoryConfig: unknown;
        }[];
        description: string | null;
        rules: null;
        locationAddress: null;
        socialLinks: null;
        _count: {
            members: number;
            tournaments: number;
        };
        access: {
            visibility: string;
            isAuthenticated: boolean;
            isMember: boolean;
            membershipStatus: string | null;
            membershipRole: string | null;
            isAdmin: boolean;
            canViewContent: boolean;
            canViewFeed: boolean;
            canViewMembers: boolean;
            canPost: boolean;
        };
    }>;
    create(userId: string, dto: CreateCommunityDto): Promise<{
        id: string;
        name: string;
        description: string | null;
        bannerUrl: string | null;
        logoUrl: string | null;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
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
    }>;
    update(userId: string, id: string, dto: UpdateCommunityDto, roles: string[]): Promise<{
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
    review(adminId: string, id: string, dto: ReviewCommunityDto, roles?: string[]): Promise<{
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
    remove(userId: string, id: string, roles: string[]): Promise<{
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
    getMembers(id: string, query?: {
        page?: number;
        limit?: number;
        cursor?: string;
        status?: string;
        search?: string;
        mentionable?: boolean;
    }, viewer?: CommunityViewer): Promise<{
        data: {
            streak: {
                type: "WIN" | "LOSS" | "ELO_UP";
                count: number;
                label: string;
            };
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
    addMember(requesterId: string, communityId: string, dto: AddMemberDto, roles: string[]): Promise<{
        id: string;
        status: string;
        approvedBy: string | null;
        communityId: string;
        userId: string;
        role: string;
        joinedAt: Date;
        invitedBy: string | null;
        tags: string[];
        joinAnswers: Record<string, string> | null;
        notificationPreference: string;
        approvedAt: Date | null;
    }>;
    updateMemberRole(requesterId: string, communityId: string, targetUserId: string, dto: UpdateMemberDto, roles: string[]): Promise<{
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
    removeMember(requesterId: string, communityId: string, targetUserId: string, roles: string[]): Promise<{
        id: string;
        status: string;
        approvedBy: string | null;
        communityId: string;
        userId: string;
        role: string;
        joinedAt: Date;
        invitedBy: string | null;
        tags: string[];
        joinAnswers: Record<string, string> | null;
        notificationPreference: string;
        approvedAt: Date | null;
    }>;
    joinCommunity(userId: string, id: string, answers?: Record<string, string>): Promise<{
        id: string;
        status: string;
        approvedBy: string | null;
        communityId: string;
        userId: string;
        role: string;
        joinedAt: Date;
        invitedBy: string | null;
        tags: string[];
        joinAnswers: Record<string, string> | null;
        notificationPreference: string;
        approvedAt: Date | null;
    }>;
    reviewJoinRequest(userId: string, id: string, memberId: string, action: 'APPROVE' | 'REJECT', roles: string[]): Promise<{
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
    followCommunity(userId: string, id: string): Promise<{
        id: string;
        createdAt: Date;
        communityId: string;
        type: string;
        userId: string;
    }>;
    unfollowCommunity(userId: string, id: string): Promise<{
        id: string;
        createdAt: Date;
        communityId: string;
        type: string;
        userId: string;
    }>;
    favoriteCommunity(userId: string, id: string): Promise<{
        id: string;
        createdAt: Date;
        communityId: string;
        type: string;
        userId: string;
    }>;
    unfavoriteCommunity(userId: string, id: string): Promise<{
        id: string;
        createdAt: Date;
        communityId: string;
        type: string;
        userId: string;
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
    getJoinRequests(userId: string, id: string, roles: string[]): Promise<{
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
    inviteMember(userId: string, id: string, targetUserId: string, role: CommunityMemberRole, roles: string[]): Promise<{
        id: string;
        status: string;
        approvedBy: string | null;
        communityId: string;
        userId: string;
        role: string;
        joinedAt: Date;
        invitedBy: string | null;
        tags: string[];
        joinAnswers: Record<string, string> | null;
        notificationPreference: string;
        approvedAt: Date | null;
    }>;
    banMember(requesterId: string, communityId: string, targetUserId: string, roles: string[]): Promise<{
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
    unbanMember(requesterId: string, communityId: string, targetUserId: string, roles: string[]): Promise<{
        id: string;
        status: string;
        approvedBy: string | null;
        communityId: string;
        userId: string;
        role: string;
        joinedAt: Date;
        invitedBy: string | null;
        tags: string[];
        joinAnswers: Record<string, string> | null;
        notificationPreference: string;
        approvedAt: Date | null;
    }>;
    computeStreaks(communityId: string, memberIds: string[]): Promise<Record<string, {
        type: 'WIN' | 'LOSS' | 'ELO_UP';
        count: number;
        label: string;
    }>>;
    updateMemberTags(requesterId: string, communityId: string, targetUserId: string, tags: string[], roles: string[]): Promise<{
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
    getTagPresets(communityId: string): Promise<{
        id: string;
        communityId: string;
        name: string;
        color: string;
        createdBy: string | null;
        createdAt: Date;
    }[]>;
    createTagPreset(requesterId: string, communityId: string, name: string, color: string, roles: string[]): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        createdBy: string | null;
        communityId: string;
        color: string;
    }>;
    deleteTagPreset(requesterId: string, communityId: string, presetId: string, roles: string[]): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        createdBy: string | null;
        communityId: string;
        color: string;
    }>;
    respondToInvite(userId: string, id: string, action: 'ACCEPT' | 'DECLINE'): Promise<{
        id: string;
        status: string;
        approvedBy: string | null;
        communityId: string;
        userId: string;
        role: string;
        joinedAt: Date;
        invitedBy: string | null;
        tags: string[];
        joinAnswers: Record<string, string> | null;
        notificationPreference: string;
        approvedAt: Date | null;
    }>;
    getGallery(id: string, viewer?: CommunityViewer): Promise<{
        id: string;
        communityId: string;
        uploaderId: string | null;
        imageUrl: string;
        caption: string | null;
        createdAt: Date;
    }[]>;
    addGalleryItem(userId: string, id: string, imageUrl: string, caption?: string, roles?: string[]): Promise<{
        id: string;
        createdAt: Date;
        communityId: string;
        uploaderId: string | null;
        imageUrl: string;
        caption: string | null;
    }>;
    removeGalleryItem(userId: string, id: string, imageId: string, roles: string[]): Promise<{
        id: string;
        createdAt: Date;
        communityId: string;
        uploaderId: string | null;
        imageUrl: string;
        caption: string | null;
    }>;
    getTournaments(id: string, status?: string, viewer?: CommunityViewer): Promise<{
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
    getRankings(id: string, limit?: number, viewer?: CommunityViewer): Promise<{
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
    private sanitizeDescription;
    private loadSanitizeHtml;
    private resolveAccess;
    private checkPermissions;
    private getCommunityRoleLabel;
    private isRolePromotion;
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
export {};
