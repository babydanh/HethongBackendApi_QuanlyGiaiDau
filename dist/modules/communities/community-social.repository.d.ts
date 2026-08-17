import type { AppDb } from '../../database/db.types';
import * as schema from '../../database/schema';
import type { CreateCommunityPostDto } from './dto/create-community-post.dto';
export declare class CommunitySocialRepository {
    private readonly db;
    constructor(db: AppDb);
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
    createPost(communityId: string, authorId: string, dto: CreateCommunityPostDto, status: 'PUBLISHED' | 'PENDING', idempotencyKey?: string): Promise<{
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
    } | null>;
    listPosts(communityId: string, limit: number, cursor?: string, viewerId?: string): Promise<{
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
    updateSettings(communityId: string, values: Partial<Pick<typeof schema.communitySocialSettings.$inferInsert, 'postingPolicy' | 'postApprovalRequired' | 'commentsEnabled' | 'chatEnabled' | 'publicFeed' | 'memberTaggingPolicy'>>): Promise<{
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
    findPost(postId: string): Promise<{
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
    findComment(commentId: string): Promise<{
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
    createComment(postId: string, authorId: string, body: string, parentId?: string): Promise<{
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
    updateComment(commentId: string, body: string): Promise<{
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
    softDeleteComment(commentId: string): Promise<{
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
    moderateComment(commentId: string, status: 'PUBLISHED' | 'HIDDEN' | 'REJECTED', reason?: string): Promise<{
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
    listPendingPosts(communityId: string, limit?: number): Promise<{
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
    listComments(postId: string, limit: number, cursor?: string): Promise<{
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
    setReaction(postId: string, userId: string, reactionType: string): Promise<{
        reactionType: string | null;
        count: number;
    }>;
    createReport(values: {
        communityId: string;
        reporterId: string;
        postId?: string;
        commentId?: string;
        reason: string;
        details?: string;
    }): Promise<{
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
    updatePreferences(communityId: string, userId: string, values: {
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
    getJoinedMentionIds(communityId: string, ids: string[]): Promise<string[]>;
    updatePostStatus(postId: string, status: 'PUBLISHED' | 'REJECTED' | 'HIDDEN'): Promise<{
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
    softDeletePost(postId: string): Promise<{
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
    createTournamentPost(communityId: string, authorId: string, tournamentId: string, tournamentName: string, bannerUrl?: string | null, isLite?: boolean): Promise<{
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
    createPoll(communityId: string, creatorId: string, dto: {
        question: string;
        options: string[];
        allowMultipleAnswers?: boolean;
        allowAddOptions?: boolean;
        expiresAt?: string;
    }, postId?: string): Promise<{
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
    getPollDetails(pollId: string, viewerId?: string): Promise<{
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
    getPollByPostId(postId: string, viewerId?: string): Promise<{
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
    votePollOption(pollId: string, optionId: string, userId: string): Promise<{
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
    addPollOption(pollId: string, creatorId: string, optionText: string): Promise<{
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
    closePoll(pollId: string): Promise<{
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
    softDeletePostsByTournamentId(tournamentId: string): Promise<{
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
}
