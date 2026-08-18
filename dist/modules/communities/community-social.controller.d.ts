import { CommunitySocialService } from './community-social.service';
import { CreateCommunityPostDto } from './dto/create-community-post.dto';
import { QueryCommunityPostsDto } from './dto/query-community-posts.dto';
import { CreateCommunityCommentDto } from './dto/create-community-comment.dto';
import { ReactCommunityPostDto } from './dto/react-community-post.dto';
import { UpdateCommunitySocialSettingsDto } from './dto/update-community-social-settings.dto';
import { ReportCommunityContentDto } from './dto/report-community-content.dto';
import { UpdateCommunityPreferencesDto } from './dto/update-community-preferences.dto';
import { ModerateCommunityPostDto } from './dto/moderate-community-post.dto';
import { UpdateCommunityCommentDto } from './dto/update-community-comment.dto';
import { ModerateCommunityCommentDto } from './dto/moderate-community-comment.dto';
export declare class CommunitySocialController {
    private readonly socialService;
    constructor(socialService: CommunitySocialService);
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
    updateSettings(communityId: string, user: {
        id: string;
        roles?: string[];
    }, dto: UpdateCommunitySocialSettingsDto): Promise<{
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
    listPosts(communityId: string, query: QueryCommunityPostsDto, user?: {
        id: string;
        roles?: string[];
    }): Promise<{
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
                inviteCode: string | null;
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
    createPost(communityId: string, user: {
        id: string;
        roles?: string[];
    }, dto: CreateCommunityPostDto, idempotencyKey?: string): Promise<{
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
        tournamentId: string | null;
        type: string;
        authorId: string | null;
        body: string | null;
        mediaUrls: string[];
        topics: string[];
        mentions: string[];
        idempotencyKey: string | null;
        reactionCount: number;
        commentCount: number;
    }>;
    deletePost(communityId: string, postId: string, user: {
        id: string;
        roles?: string[];
    }): Promise<{
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
    listComments(communityId: string, postId: string, limit?: number, cursor?: string, user?: {
        id: string;
        roles?: string[];
    }): Promise<{
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
    createComment(communityId: string, postId: string, user: {
        id: string;
        roles?: string[];
    }, dto: CreateCommunityCommentDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
        parentId: string | null;
        status: string;
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
    updateComment(communityId: string, commentId: string, user: {
        id: string;
        roles?: string[];
    }, dto: UpdateCommunityCommentDto): Promise<{
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
    deleteComment(communityId: string, commentId: string, user: {
        id: string;
        roles?: string[];
    }): Promise<{
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
    moderateComment(communityId: string, commentId: string, user: {
        id: string;
        roles?: string[];
    }, dto: ModerateCommunityCommentDto): Promise<{
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
    listPendingPosts(communityId: string, user: {
        id: string;
        roles?: string[];
    }): Promise<{
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
    react(communityId: string, postId: string, user: {
        id: string;
        roles?: string[];
    }, dto: ReactCommunityPostDto): Promise<{
        reactionType: string | null;
        count: number;
    }>;
    report(communityId: string, postId: string, user: {
        id: string;
        roles?: string[];
    }, dto: ReportCommunityContentDto): Promise<{
        id: string;
        createdAt: Date;
        status: string;
        communityId: string;
        postId: string | null;
        reporterId: string;
        commentId: string | null;
        reason: string;
        details: string | null;
        resolvedAt: Date | null;
    }>;
    moderate(communityId: string, postId: string, user: {
        id: string;
        roles?: string[];
    }, dto: ModerateCommunityPostDto): Promise<{
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
    updatePreferences(communityId: string, user: {
        id: string;
        roles?: string[];
    }, dto: UpdateCommunityPreferencesDto): Promise<{
        id: string;
        updatedAt: Date;
        communityId: string;
        userId: string;
        muted: boolean;
        notificationsEnabled: boolean;
    }>;
    votePoll(communityId: string, pollId: string, user: {
        id: string;
        roles?: string[];
    }, optionId: string): Promise<{
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
    addPollOption(communityId: string, pollId: string, user: {
        id: string;
        roles?: string[];
    }, optionText: string): Promise<{
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
    closePoll(communityId: string, pollId: string, user: {
        id: string;
        roles?: string[];
    }): Promise<{
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
}
