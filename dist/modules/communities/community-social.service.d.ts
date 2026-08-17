import { CommunitiesRepository } from './communities.repository';
import { CommunitySocialRepository } from './community-social.repository';
import type { CreateCommunityPostDto } from './dto/create-community-post.dto';
import type { CreateCommunityCommentDto } from './dto/create-community-comment.dto';
import type { UpdateCommunitySocialSettingsDto } from './dto/update-community-social-settings.dto';
import type { ReportCommunityContentDto } from './dto/report-community-content.dto';
import type { UpdateCommunityCommentDto } from './dto/update-community-comment.dto';
import { NotificationsService } from '../notifications/notifications.service';
type SocialUser = {
    id: string;
    fullName?: string;
    roles?: string[];
};
export declare class CommunitySocialService {
    private readonly socialRepository;
    private readonly communitiesRepository;
    private readonly notificationsService;
    constructor(socialRepository: CommunitySocialRepository, communitiesRepository: CommunitiesRepository, notificationsService: NotificationsService);
    getSettings(communityId: string): Promise<{
        communityId: string;
        postingPolicy: string;
        postApprovalRequired: boolean;
        commentsEnabled: boolean;
        chatEnabled: boolean;
        publicFeed: boolean;
        memberTaggingPolicy: string;
        createdAt: Date;
        updatedAt: Date;
    }>;
    listPosts(communityId: string, limit: number, cursor?: string, viewer?: SocialUser): Promise<{
        data: {
            poll: any;
            author: {
                id: string | null;
                fullName: string | null;
                avatarUrl: string | null;
            } | null;
            tournament: {
                id: string | null;
                name: string | null;
                sport: string | null;
                categoryName: string | null;
                matchType: string | null;
                startDate: Date | null;
                endDate: Date | null;
                status: string | null;
                bannerUrl: string | null;
                maxParticipants: number | null;
            } | null;
            viewerReaction: string | null;
            id: string;
            communityId: string;
            authorId: string | null;
            tournamentId: string | null;
            type: string;
            body: string | null;
            mediaUrls: string[];
            topics: string[];
            mentions: string[];
            status: string;
            idempotencyKey: string | null;
            reactionCount: number;
            commentCount: number;
            createdAt: Date;
            updatedAt: Date;
            deletedAt: Date | null;
        }[];
        meta: {
            limit: number;
            hasMore: boolean;
            nextCursor: string | null;
        };
    }>;
    createPost(communityId: string, user: SocialUser, dto: CreateCommunityPostDto, idempotencyKey?: string): Promise<{
        poll: any;
        author: {
            id: string;
            fullName: string | null;
            avatarUrl: string | null;
        };
        id: string;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
        status: string;
        communityId: string;
        type: string;
        tournamentId: string | null;
        idempotencyKey: string | null;
        authorId: string | null;
        body: string | null;
        mediaUrls: string[];
        topics: string[];
        mentions: string[];
        reactionCount: number;
        commentCount: number;
    }>;
    deletePost(communityId: string, postId: string, user: SocialUser): Promise<{
        id: string;
        communityId: string;
        authorId: string | null;
        tournamentId: string | null;
        type: string;
        body: string | null;
        mediaUrls: string[];
        topics: string[];
        mentions: string[];
        status: string;
        idempotencyKey: string | null;
        reactionCount: number;
        commentCount: number;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
    }>;
    updateSettings(communityId: string, user: SocialUser, dto: UpdateCommunitySocialSettingsDto): Promise<{
        createdAt: Date;
        updatedAt: Date;
        communityId: string;
        postingPolicy: string;
        postApprovalRequired: boolean;
        commentsEnabled: boolean;
        chatEnabled: boolean;
        publicFeed: boolean;
        memberTaggingPolicy: string;
    }>;
    listComments(communityId: string, postId: string, limit: number, cursor?: string, viewer?: SocialUser): Promise<{
        data: {
            author: {
                id: string | null;
                fullName: string | null;
                avatarUrl: string | null;
            } | null;
            id: string;
            postId: string;
            authorId: string | null;
            parentId: string | null;
            body: string;
            status: string;
            moderationReason: string | null;
            createdAt: Date;
            updatedAt: Date;
            deletedAt: Date | null;
        }[];
        meta: {
            limit: number;
            hasMore: boolean;
            nextCursor: string | null;
        };
    }>;
    createComment(communityId: string, postId: string, user: SocialUser, dto: CreateCommunityCommentDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
        status: string;
        parentId: string | null;
        authorId: string | null;
        body: string;
        postId: string;
        moderationReason: string | null;
    } | {
        author: {
            id: string | null;
            fullName: string | null;
            avatarUrl: string | null;
        } | null;
        id: string;
        postId: string;
        authorId: string | null;
        parentId: string | null;
        body: string;
        status: string;
        moderationReason: string | null;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
    } | null>;
    updateComment(communityId: string, commentId: string, user: SocialUser, dto: UpdateCommunityCommentDto): Promise<{
        id: string;
        postId: string;
        authorId: string | null;
        parentId: string | null;
        body: string;
        status: string;
        moderationReason: string | null;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
    }>;
    deleteComment(communityId: string, commentId: string, user: SocialUser): Promise<{
        id: string;
        postId: string;
        authorId: string | null;
        parentId: string | null;
        body: string;
        status: string;
        moderationReason: string | null;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
    }>;
    moderateComment(communityId: string, commentId: string, user: SocialUser, status: 'PUBLISHED' | 'HIDDEN' | 'REJECTED', reason?: string): Promise<{
        id: string;
        postId: string;
        authorId: string | null;
        parentId: string | null;
        body: string;
        status: string;
        moderationReason: string | null;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
    }>;
    listPendingPosts(communityId: string, user: SocialUser): Promise<{
        author: {
            id: string | null;
            fullName: string | null;
            avatarUrl: string | null;
        } | null;
        id: string;
        communityId: string;
        authorId: string | null;
        tournamentId: string | null;
        type: string;
        body: string | null;
        mediaUrls: string[];
        topics: string[];
        mentions: string[];
        status: string;
        idempotencyKey: string | null;
        reactionCount: number;
        commentCount: number;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
    }[]>;
    react(communityId: string, postId: string, user: SocialUser, reactionType: string): Promise<{
        reactionType: string | null;
        count: number;
    }>;
    report(communityId: string, postId: string, user: SocialUser, dto: ReportCommunityContentDto): Promise<{
        id: string;
        createdAt: Date;
        status: string;
        communityId: string;
        reason: string;
        resolvedAt: Date | null;
        reporterId: string;
        postId: string | null;
        commentId: string | null;
        details: string | null;
    }>;
    updatePreferences(communityId: string, user: SocialUser, values: {
        muted: boolean;
        notificationsEnabled: boolean;
    }): Promise<{
        id: string;
        updatedAt: Date;
        communityId: string;
        userId: string;
        muted: boolean;
        notificationsEnabled: boolean;
    }>;
    moderatePost(communityId: string, postId: string, user: SocialUser, status: 'PUBLISHED' | 'REJECTED' | 'HIDDEN'): Promise<{
        id: string;
        communityId: string;
        authorId: string | null;
        tournamentId: string | null;
        type: string;
        body: string | null;
        mediaUrls: string[];
        topics: string[];
        mentions: string[];
        status: string;
        idempotencyKey: string | null;
        reactionCount: number;
        commentCount: number;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
    }>;
    votePoll(communityId: string, pollId: string, optionId: string, user: SocialUser): Promise<{
        creator: {
            id: string | null;
            fullName: string | null;
            avatarUrl: string | null;
        } | null;
        totalVotes: number;
        options: {
            id: string;
            pollId: string;
            optionText: string;
            voteCount: number;
            isVoted: boolean;
            voters: {
                id: string;
                fullName: string;
                avatarUrl: string | null;
            }[];
        }[];
        id: string;
        communityId: string;
        postId: string | null;
        creatorId: string | null;
        question: string;
        allowMultipleAnswers: boolean;
        allowAddOptions: boolean;
        isClosed: boolean;
        expiresAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
    } | null>;
    addPollOption(communityId: string, pollId: string, optionText: string, user: SocialUser): Promise<{
        creator: {
            id: string | null;
            fullName: string | null;
            avatarUrl: string | null;
        } | null;
        totalVotes: number;
        options: {
            id: string;
            pollId: string;
            optionText: string;
            voteCount: number;
            isVoted: boolean;
            voters: {
                id: string;
                fullName: string;
                avatarUrl: string | null;
            }[];
        }[];
        id: string;
        communityId: string;
        postId: string | null;
        creatorId: string | null;
        question: string;
        allowMultipleAnswers: boolean;
        allowAddOptions: boolean;
        isClosed: boolean;
        expiresAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
    } | null>;
    closePoll(communityId: string, pollId: string, user: SocialUser): Promise<{
        creator: {
            id: string | null;
            fullName: string | null;
            avatarUrl: string | null;
        } | null;
        totalVotes: number;
        options: {
            id: string;
            pollId: string;
            optionText: string;
            voteCount: number;
            isVoted: boolean;
            voters: {
                id: string;
                fullName: string;
                avatarUrl: string | null;
            }[];
        }[];
        id: string;
        communityId: string;
        postId: string | null;
        creatorId: string | null;
        question: string;
        allowMultipleAnswers: boolean;
        allowAddOptions: boolean;
        isClosed: boolean;
        expiresAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
    } | null>;
    private ensureCommunity;
    private requireJoined;
    private requireManager;
}
export {};
