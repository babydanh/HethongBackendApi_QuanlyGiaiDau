import { CommunitiesService } from './communities.service';
import { CreateCommunityDto } from './dto/create-community.dto';
import { UpdateCommunityDto } from './dto/update-community.dto';
import { QueryCommunityDto } from './dto/query-community.dto';
import { QueryMembersDto } from './dto/query-members.dto';
import { ReviewCommunityDto } from './dto/review-community.dto';
import { AddMemberDto } from './dto/add-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { UpdateMemberTagsDto } from './dto/update-member-tags.dto';
import { CreateTagPresetDto } from './dto/create-tag-preset.dto';
import { JoinCommunityDto } from './dto/join-community.dto';
import { ReviewJoinDto } from './dto/review-join.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { CreateGalleryItemDto } from './dto/create-gallery-item.dto';
import { UpdateNotificationPreferenceDto } from './dto/update-notification-preference.dto';
export declare class CommunitiesController {
    private readonly communitiesService;
    constructor(communitiesService: CommunitiesService);
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
    findMyCommunities(user: {
        id: string;
    }): Promise<{
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
    findMyInvites(user: {
        id: string;
    }): Promise<{
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
    findFavorites(user: {
        id: string;
    }): Promise<{
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
    findPending(query: QueryCommunityDto): Promise<{
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
    findAllAdmin(query: QueryCommunityDto): Promise<{
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
    getDashboard(id: string, user?: {
        id: string;
        roles?: string[];
    }): Promise<{
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
    getMyMembership(user: {
        id: string;
    }, id: string): Promise<{
        role: string;
        status: string;
        memberId: string;
        joinedAt: Date;
        joinAnswers: Record<string, string> | null;
    }>;
    findOne(id: string, user?: {
        id: string;
        roles: string[];
    }): Promise<{
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
    create(user: {
        id: string;
        roles: string[];
    }, createCommunityDto: CreateCommunityDto): Promise<{
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
    update(user: {
        id: string;
        roles: string[];
    }, id: string, updateCommunityDto: UpdateCommunityDto): Promise<{
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
    review(user: {
        id: string;
        roles: string[];
    }, id: string, reviewDto: ReviewCommunityDto): Promise<{
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
    remove(user: {
        id: string;
        roles: string[];
    }, id: string): Promise<{
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
    getMembers(id: string, query: QueryMembersDto, user?: {
        id: string;
        roles?: string[];
    }): Promise<{
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
    addMember(user: {
        id: string;
        roles: string[];
    }, id: string, addMemberDto: AddMemberDto): Promise<{
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
    updateMemberRole(user: {
        id: string;
        roles: string[];
    }, id: string, userId: string, updateMemberDto: UpdateMemberDto): Promise<{
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
    updateMemberTags(user: {
        id: string;
        roles: string[];
    }, id: string, userId: string, updateMemberTagsDto: UpdateMemberTagsDto): Promise<{
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
    getTagPresets(id: string): Promise<{
        id: string;
        communityId: string;
        name: string;
        color: string;
        createdBy: string | null;
        createdAt: Date;
    }[]>;
    createTagPreset(user: {
        id: string;
        roles: string[];
    }, id: string, dto: CreateTagPresetDto): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        createdBy: string | null;
        communityId: string;
        color: string;
    }>;
    deleteTagPreset(user: {
        id: string;
        roles: string[];
    }, id: string, presetId: string): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        createdBy: string | null;
        communityId: string;
        color: string;
    }>;
    removeMember(user: {
        id: string;
        roles: string[];
    }, id: string, userId: string): Promise<{
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
    banMember(user: {
        id: string;
        roles: string[];
    }, id: string, userId: string): Promise<{
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
    unbanMember(user: {
        id: string;
        roles: string[];
    }, id: string, userId: string): Promise<{
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
    joinCommunity(user: {
        id: string;
    }, id: string, body: JoinCommunityDto): Promise<{
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
    reviewJoinRequest(user: {
        id: string;
        roles: string[];
    }, id: string, memberId: string, body: ReviewJoinDto): Promise<{
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
    followCommunity(user: {
        id: string;
    }, id: string): Promise<{
        id: string;
        createdAt: Date;
        communityId: string;
        type: string;
        userId: string;
    }>;
    unfollowCommunity(user: {
        id: string;
    }, id: string): Promise<{
        id: string;
        createdAt: Date;
        communityId: string;
        type: string;
        userId: string;
    }>;
    favoriteCommunity(user: {
        id: string;
    }, id: string): Promise<{
        id: string;
        createdAt: Date;
        communityId: string;
        type: string;
        userId: string;
    }>;
    unfavoriteCommunity(user: {
        id: string;
    }, id: string): Promise<{
        id: string;
        createdAt: Date;
        communityId: string;
        type: string;
        userId: string;
    }>;
    getJoinRequests(user: {
        id: string;
        roles: string[];
    }, id: string): Promise<{
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
    inviteMember(user: {
        id: string;
        roles: string[];
    }, id: string, body: InviteMemberDto): Promise<{
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
    respondToInvite(user: {
        id: string;
    }, id: string, action: 'accept' | 'decline'): Promise<{
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
    getGallery(id: string, user?: {
        id: string;
        roles?: string[];
    }): Promise<{
        id: string;
        communityId: string;
        uploaderId: string | null;
        imageUrl: string;
        caption: string | null;
        createdAt: Date;
    }[]>;
    addGalleryItem(user: {
        id: string;
        roles: string[];
    }, id: string, body: CreateGalleryItemDto): Promise<{
        id: string;
        createdAt: Date;
        communityId: string;
        uploaderId: string | null;
        imageUrl: string;
        caption: string | null;
    }>;
    removeGalleryItem(user: {
        id: string;
        roles: string[];
    }, id: string, imageId: string): Promise<{
        id: string;
        createdAt: Date;
        communityId: string;
        uploaderId: string | null;
        imageUrl: string;
        caption: string | null;
    }>;
    getTournaments(id: string, status?: string, user?: {
        id: string;
        roles?: string[];
    }): Promise<{
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
    getRankings(id: string, limit?: number, user?: {
        id: string;
        roles?: string[];
    }): Promise<{
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
    updateMyNotificationPreference(user: {
        id: string;
    }, id: string, dto: UpdateNotificationPreferenceDto): Promise<{
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
    getMyNotificationPreferences(user: {
        id: string;
    }): Promise<{
        communityId: string;
        communityName: string;
        logoUrl: string | null;
        role: string;
        notificationPreference: string;
    }[]>;
}
