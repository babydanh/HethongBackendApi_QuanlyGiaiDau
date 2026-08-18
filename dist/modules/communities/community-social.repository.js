"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommunitySocialRepository = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const database_module_1 = require("../../database/database.module");
const schema = __importStar(require("../../database/schema"));
const cursor_pagination_helper_1 = require("../../common/helpers/cursor-pagination.helper");
let CommunitySocialRepository = class CommunitySocialRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    async getSettings(communityId) {
        const [settings] = await this.db
            .select()
            .from(schema.communitySocialSettings)
            .where((0, drizzle_orm_1.eq)(schema.communitySocialSettings.communityId, communityId))
            .limit(1);
        return settings ?? {
            communityId,
            postingPolicy: 'MEMBERS',
            postApprovalRequired: false,
            commentsEnabled: true,
            chatEnabled: true,
            publicFeed: true,
            memberTaggingPolicy: 'MEMBERS',
        };
    }
    async createPost(communityId, authorId, dto, status, idempotencyKey) {
        const values = {
            communityId,
            authorId,
            body: dto.body?.trim() || null,
            mediaUrls: (dto.mediaUrls ?? []).map((url) => url.trim()),
            topics: (dto.topics ?? []).map((topic) => topic.trim().replace(/^#/, '')),
            mentions: dto.mentions ?? [],
            status,
            idempotencyKey: idempotencyKey?.trim() || null,
        };
        const [created] = await this.db
            .insert(schema.communityPosts)
            .values(values)
            .onConflictDoNothing()
            .returning();
        const postRecord = created || (values.idempotencyKey ? (await this.db
            .select()
            .from(schema.communityPosts)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.communityPosts.communityId, communityId), (0, drizzle_orm_1.eq)(schema.communityPosts.authorId, authorId), (0, drizzle_orm_1.eq)(schema.communityPosts.idempotencyKey, values.idempotencyKey)))
            .limit(1))[0] : null);
        if (!postRecord)
            return null;
        const [authorProfile] = await this.db
            .select({
            id: schema.users.id,
            fullName: schema.profiles.fullName,
            avatarUrl: schema.profiles.avatarUrl,
        })
            .from(schema.users)
            .leftJoin(schema.profiles, (0, drizzle_orm_1.eq)(schema.users.id, schema.profiles.userId))
            .where((0, drizzle_orm_1.eq)(schema.users.id, authorId))
            .limit(1);
        return {
            ...postRecord,
            author: authorProfile?.id ? authorProfile : { id: authorId, fullName: 'Thành viên CLB', avatarUrl: null },
        };
    }
    async listPosts(communityId, limit, cursor, viewerId) {
        const conditions = [
            (0, drizzle_orm_1.eq)(schema.communityPosts.communityId, communityId),
            viewerId
                ? (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema.communityPosts.status, 'PUBLISHED'), (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.communityPosts.status, 'PENDING'), (0, drizzle_orm_1.eq)(schema.communityPosts.authorId, viewerId)))
                : (0, drizzle_orm_1.eq)(schema.communityPosts.status, 'PUBLISHED'),
            (0, drizzle_orm_1.isNull)(schema.communityPosts.deletedAt),
        ];
        const decoded = cursor
            ? cursor_pagination_helper_1.CursorPaginationHelper.decodeCursor(cursor)
            : null;
        if (decoded?.createdAt && decoded.id) {
            conditions.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.lt)(schema.communityPosts.createdAt, new Date(decoded.createdAt)), (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.communityPosts.createdAt, new Date(decoded.createdAt)), (0, drizzle_orm_1.lt)(schema.communityPosts.id, decoded.id))));
        }
        const rows = await this.db
            .select({
            post: schema.communityPosts,
            author: {
                id: schema.users.id,
                fullName: schema.profiles.fullName,
                avatarUrl: schema.profiles.avatarUrl,
            },
            tournament: {
                id: schema.tournaments.id,
                name: schema.tournaments.name,
                sport: schema.categories.slug,
                categoryName: schema.categories.name,
                matchType: schema.tournaments.matchType,
                startDate: schema.tournaments.startDate,
                endDate: schema.tournaments.endDate,
                status: schema.tournaments.status,
                bannerUrl: schema.tournaments.bannerUrl,
                maxParticipants: schema.tournaments.maxParticipants,
                inviteCode: schema.tournaments.inviteCode,
            },
            viewerReaction: viewerId
                ? (0, drizzle_orm_1.sql) `(
              SELECT ${schema.communityPostReactions.reactionType}
              FROM ${schema.communityPostReactions}
              WHERE ${schema.communityPostReactions.postId} = ${schema.communityPosts.id}
                AND ${schema.communityPostReactions.userId} = ${viewerId}
              LIMIT 1
            )`
                : (0, drizzle_orm_1.sql) `NULL`,
        })
            .from(schema.communityPosts)
            .leftJoin(schema.users, (0, drizzle_orm_1.eq)(schema.communityPosts.authorId, schema.users.id))
            .leftJoin(schema.profiles, (0, drizzle_orm_1.eq)(schema.communityPosts.authorId, schema.profiles.userId))
            .leftJoin(schema.tournaments, (0, drizzle_orm_1.eq)(schema.communityPosts.tournamentId, schema.tournaments.id))
            .leftJoin(schema.categories, (0, drizzle_orm_1.eq)(schema.tournaments.categoryId, schema.categories.id))
            .where((0, drizzle_orm_1.and)(...conditions))
            .orderBy((0, drizzle_orm_1.desc)(schema.communityPosts.createdAt), (0, drizzle_orm_1.desc)(schema.communityPosts.id))
            .limit(limit + 1);
        const hasMore = rows.length > limit;
        const initialData = (hasMore ? rows.slice(0, limit) : rows).map((row) => ({
            ...row.post,
            author: row.author?.id ? row.author : null,
            tournament: row.tournament?.id ? row.tournament : null,
            viewerReaction: row.viewerReaction,
        }));
        const postIds = initialData.map((p) => p.id);
        const polls = postIds.length > 0
            ? await this.db
                .select({ id: schema.communityPolls.id, postId: schema.communityPolls.postId })
                .from(schema.communityPolls)
                .where((0, drizzle_orm_1.inArray)(schema.communityPolls.postId, postIds))
            : [];
        const pollDetailsMap = new Map();
        for (const p of polls) {
            if (p.postId) {
                const details = await this.getPollDetails(p.id, viewerId);
                if (details)
                    pollDetailsMap.set(p.postId, details);
            }
        }
        const data = initialData.map((p) => ({
            ...p,
            poll: pollDetailsMap.get(p.id) || null,
        }));
        const last = data[data.length - 1];
        return {
            data,
            meta: {
                limit,
                hasMore,
                nextCursor: hasMore && last
                    ? cursor_pagination_helper_1.CursorPaginationHelper.encodeCursor({ id: last.id, createdAt: last.createdAt })
                    : null,
            },
        };
    }
    async updateSettings(communityId, values) {
        const [settings] = await this.db
            .insert(schema.communitySocialSettings)
            .values({ communityId, ...values })
            .onConflictDoUpdate({
            target: schema.communitySocialSettings.communityId,
            set: { ...values, updatedAt: new Date() },
        })
            .returning();
        return settings;
    }
    async findPost(postId) {
        const [post] = await this.db.select().from(schema.communityPosts)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.communityPosts.id, postId), (0, drizzle_orm_1.isNull)(schema.communityPosts.deletedAt))).limit(1);
        return post;
    }
    async findComment(commentId) {
        const [comment] = await this.db.select().from(schema.communityPostComments)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.communityPostComments.id, commentId), (0, drizzle_orm_1.isNull)(schema.communityPostComments.deletedAt)))
            .limit(1);
        return comment;
    }
    async createComment(postId, authorId, body, parentId) {
        const [comment] = await this.db.insert(schema.communityPostComments)
            .values({ postId, authorId, body: body.trim(), parentId: parentId ?? null }).returning();
        if (!comment)
            return null;
        await this.db.update(schema.communityPosts)
            .set({ commentCount: (0, drizzle_orm_1.sql) `${schema.communityPosts.commentCount} + 1`, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(schema.communityPosts.id, postId));
        const [row] = await this.db.select({
            comment: schema.communityPostComments,
            author: { id: schema.users.id, fullName: schema.profiles.fullName, avatarUrl: schema.profiles.avatarUrl }
        }).from(schema.communityPostComments)
            .leftJoin(schema.users, (0, drizzle_orm_1.eq)(schema.communityPostComments.authorId, schema.users.id))
            .leftJoin(schema.profiles, (0, drizzle_orm_1.eq)(schema.communityPostComments.authorId, schema.profiles.userId))
            .where((0, drizzle_orm_1.eq)(schema.communityPostComments.id, comment.id))
            .limit(1);
        return row ? { ...row.comment, author: row.author?.id ? row.author : null } : comment;
    }
    async updateComment(commentId, body) {
        const [comment] = await this.db.update(schema.communityPostComments)
            .set({ body: body.trim(), updatedAt: new Date() })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.communityPostComments.id, commentId), (0, drizzle_orm_1.isNull)(schema.communityPostComments.deletedAt)))
            .returning();
        return comment;
    }
    async softDeleteComment(commentId) {
        const [comment] = await this.db.update(schema.communityPostComments)
            .set({ deletedAt: new Date(), status: 'HIDDEN', updatedAt: new Date() })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.communityPostComments.id, commentId), (0, drizzle_orm_1.isNull)(schema.communityPostComments.deletedAt)))
            .returning();
        if (comment) {
            await this.db.update(schema.communityPosts)
                .set({ commentCount: (0, drizzle_orm_1.sql) `GREATEST(${schema.communityPosts.commentCount} - 1, 0)`, updatedAt: new Date() })
                .where((0, drizzle_orm_1.eq)(schema.communityPosts.id, comment.postId));
        }
        return comment;
    }
    async moderateComment(commentId, status, reason) {
        const [comment] = await this.db.update(schema.communityPostComments)
            .set({ status, moderationReason: reason?.trim() || null, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(schema.communityPostComments.id, commentId))
            .returning();
        return comment;
    }
    async listPendingPosts(communityId, limit = 50) {
        const rows = await this.db.select({
            post: schema.communityPosts,
            author: { id: schema.users.id, fullName: schema.profiles.fullName, avatarUrl: schema.profiles.avatarUrl },
        }).from(schema.communityPosts)
            .leftJoin(schema.users, (0, drizzle_orm_1.eq)(schema.communityPosts.authorId, schema.users.id))
            .leftJoin(schema.profiles, (0, drizzle_orm_1.eq)(schema.communityPosts.authorId, schema.profiles.userId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.communityPosts.communityId, communityId), (0, drizzle_orm_1.eq)(schema.communityPosts.status, 'PENDING'), (0, drizzle_orm_1.isNull)(schema.communityPosts.deletedAt)))
            .orderBy((0, drizzle_orm_1.desc)(schema.communityPosts.createdAt)).limit(limit);
        return rows.map((row) => ({ ...row.post, author: row.author?.id ? row.author : null }));
    }
    async listComments(postId, limit, cursor) {
        const conditions = [(0, drizzle_orm_1.eq)(schema.communityPostComments.postId, postId), (0, drizzle_orm_1.eq)(schema.communityPostComments.status, 'PUBLISHED'), (0, drizzle_orm_1.isNull)(schema.communityPostComments.deletedAt)];
        const decoded = cursor ? cursor_pagination_helper_1.CursorPaginationHelper.decodeCursor(cursor) : null;
        if (decoded?.createdAt && decoded.id) {
            conditions.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.lt)(schema.communityPostComments.createdAt, new Date(decoded.createdAt)), (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.communityPostComments.createdAt, new Date(decoded.createdAt)), (0, drizzle_orm_1.lt)(schema.communityPostComments.id, decoded.id))));
        }
        const rows = await this.db.select({ comment: schema.communityPostComments, author: { id: schema.users.id, fullName: schema.profiles.fullName, avatarUrl: schema.profiles.avatarUrl } })
            .from(schema.communityPostComments).leftJoin(schema.users, (0, drizzle_orm_1.eq)(schema.communityPostComments.authorId, schema.users.id)).leftJoin(schema.profiles, (0, drizzle_orm_1.eq)(schema.communityPostComments.authorId, schema.profiles.userId))
            .where((0, drizzle_orm_1.and)(...conditions)).orderBy((0, drizzle_orm_1.desc)(schema.communityPostComments.createdAt), (0, drizzle_orm_1.desc)(schema.communityPostComments.id)).limit(limit + 1);
        const hasMore = rows.length > limit;
        const data = (hasMore ? rows.slice(0, limit) : rows).map((row) => ({ ...row.comment, author: row.author?.id ? row.author : null }));
        const last = data[data.length - 1];
        return { data, meta: { limit, hasMore, nextCursor: hasMore && last ? cursor_pagination_helper_1.CursorPaginationHelper.encodeCursor({ id: last.id, createdAt: last.createdAt }) : null } };
    }
    async setReaction(postId, userId, reactionType) {
        const [existing] = await this.db.select().from(schema.communityPostReactions)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.communityPostReactions.postId, postId), (0, drizzle_orm_1.eq)(schema.communityPostReactions.userId, userId))).limit(1);
        if (existing?.reactionType === reactionType) {
            await this.db.delete(schema.communityPostReactions).where((0, drizzle_orm_1.eq)(schema.communityPostReactions.id, existing.id));
        }
        else if (existing) {
            await this.db.update(schema.communityPostReactions).set({ reactionType }).where((0, drizzle_orm_1.eq)(schema.communityPostReactions.id, existing.id));
        }
        else {
            await this.db.insert(schema.communityPostReactions).values({ postId, userId, reactionType });
        }
        const reactions = await this.db.select({ id: schema.communityPostReactions.id }).from(schema.communityPostReactions).where((0, drizzle_orm_1.eq)(schema.communityPostReactions.postId, postId));
        await this.db.update(schema.communityPosts).set({ reactionCount: reactions.length, updatedAt: new Date() }).where((0, drizzle_orm_1.eq)(schema.communityPosts.id, postId));
        return { reactionType: existing?.reactionType === reactionType ? null : reactionType, count: reactions.length };
    }
    async createReport(values) {
        const [report] = await this.db.insert(schema.communitySocialReports).values(values).returning();
        return report;
    }
    async updatePreferences(communityId, userId, values) {
        const [preference] = await this.db.insert(schema.communityMemberSocialPreferences).values({ communityId, userId, ...values })
            .onConflictDoUpdate({ target: [schema.communityMemberSocialPreferences.communityId, schema.communityMemberSocialPreferences.userId], set: { ...values, updatedAt: new Date() } }).returning();
        return preference;
    }
    async getJoinedMentionIds(communityId, ids) {
        if (ids.length === 0)
            return [];
        const rows = await this.db.select({ userId: schema.communityMembers.userId }).from(schema.communityMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.communityMembers.communityId, communityId), (0, drizzle_orm_1.eq)(schema.communityMembers.status, 'JOINED'), (0, drizzle_orm_1.inArray)(schema.communityMembers.userId, ids)));
        return rows.map((row) => row.userId);
    }
    async updatePostStatus(postId, status) {
        const [post] = await this.db.update(schema.communityPosts).set({ status, updatedAt: new Date() }).where((0, drizzle_orm_1.eq)(schema.communityPosts.id, postId)).returning();
        return post;
    }
    async softDeletePost(postId) {
        const [post] = await this.db.update(schema.communityPosts)
            .set({ deletedAt: new Date(), status: 'HIDDEN', updatedAt: new Date() })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.communityPosts.id, postId), (0, drizzle_orm_1.isNull)(schema.communityPosts.deletedAt)))
            .returning();
        return post;
    }
    async createTournamentPost(communityId, authorId, tournamentId, tournamentName, bannerUrl, isLite = false) {
        const mediaUrls = bannerUrl ? [bannerUrl] : [];
        const body = isLite
            ? `⚡ CLB vừa mở giải đấu nhanh: **${tournamentName}**! Bình chọn tham gia ngay bên dưới hoặc quét mã QR để vào phòng đấu.`
            : `🏆 CLB vừa công bố giải đấu mới: **${tournamentName}**! Các thành viên hãy nhanh tay đăng ký tham gia ngay.`;
        const [post] = await this.db.insert(schema.communityPosts)
            .values({
            communityId,
            authorId,
            tournamentId,
            type: 'TOURNAMENT_ANNOUNCEMENT',
            body,
            mediaUrls,
            status: 'PUBLISHED',
        })
            .returning();
        if (post && isLite) {
            try {
                await this.createPoll(communityId, authorId, {
                    question: `Bạn có tham gia giải "${tournamentName}" không?`,
                    options: ['✅ Có tham gia (Đăng ký ngay)', '⏳ Chưa chắc chắn', '❌ Bận / Không tham gia'],
                    allowMultipleAnswers: false,
                    allowAddOptions: false,
                }, post.id);
            }
            catch (pollErr) {
                console.error('Failed to create interactive poll for lite tournament post:', pollErr);
            }
        }
        return post;
    }
    async createPoll(communityId, creatorId, dto, postId) {
        const [poll] = await this.db
            .insert(schema.communityPolls)
            .values({
            communityId,
            creatorId,
            postId: postId ?? null,
            question: dto.question.trim(),
            allowMultipleAnswers: dto.allowMultipleAnswers ?? false,
            allowAddOptions: dto.allowAddOptions ?? true,
            expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        })
            .returning();
        if (!poll)
            return null;
        if (dto.options.length > 0) {
            await this.db.insert(schema.communityPollOptions).values(dto.options.map((opt) => ({
                pollId: poll.id,
                creatorId,
                optionText: opt.trim(),
            })));
        }
        return this.getPollDetails(poll.id, creatorId);
    }
    async getPollDetails(pollId, viewerId) {
        const [poll] = await this.db
            .select({
            poll: schema.communityPolls,
            creator: {
                id: schema.users.id,
                fullName: schema.profiles.fullName,
                avatarUrl: schema.profiles.avatarUrl,
            },
        })
            .from(schema.communityPolls)
            .leftJoin(schema.users, (0, drizzle_orm_1.eq)(schema.communityPolls.creatorId, schema.users.id))
            .leftJoin(schema.profiles, (0, drizzle_orm_1.eq)(schema.communityPolls.creatorId, schema.profiles.userId))
            .where((0, drizzle_orm_1.eq)(schema.communityPolls.id, pollId))
            .limit(1);
        if (!poll)
            return null;
        const options = await this.db
            .select()
            .from(schema.communityPollOptions)
            .where((0, drizzle_orm_1.eq)(schema.communityPollOptions.pollId, pollId))
            .orderBy((0, drizzle_orm_1.asc)(schema.communityPollOptions.id));
        options.sort((a, b) => {
            const score = (text) => {
                if (text.includes('Có tham gia') || text.includes('Đăng ký') || text.includes('✅'))
                    return 1;
                if (text.includes('Chưa chắc chắn') || text.includes('suy nghĩ') || text.includes('⏳'))
                    return 2;
                if (text.includes('Không') || text.includes('Bận') || text.includes('❌'))
                    return 3;
                return 2;
            };
            return score(a.optionText) - score(b.optionText);
        });
        const optionIds = options.map((o) => o.id);
        let votes = [];
        if (optionIds.length > 0) {
            votes = await this.db
                .select({
                optionId: schema.communityPollVotes.optionId,
                userId: schema.communityPollVotes.userId,
                fullName: schema.profiles.fullName,
                avatarUrl: schema.profiles.avatarUrl,
            })
                .from(schema.communityPollVotes)
                .leftJoin(schema.users, (0, drizzle_orm_1.eq)(schema.communityPollVotes.userId, schema.users.id))
                .leftJoin(schema.profiles, (0, drizzle_orm_1.eq)(schema.communityPollVotes.userId, schema.profiles.userId))
                .where((0, drizzle_orm_1.inArray)(schema.communityPollVotes.optionId, optionIds));
        }
        const totalVotes = votes.length;
        const optionsWithVoters = options.map((opt) => {
            const optVotes = votes.filter((v) => v.optionId === opt.id);
            const isVoted = viewerId ? optVotes.some((v) => v.userId === viewerId) : false;
            return {
                id: opt.id,
                pollId: opt.pollId,
                optionText: opt.optionText,
                voteCount: optVotes.length,
                isVoted,
                voters: optVotes.map((v) => ({
                    id: v.userId,
                    fullName: v.fullName || 'Thành viên',
                    avatarUrl: v.avatarUrl,
                })),
            };
        });
        return {
            ...poll.poll,
            creator: poll.creator?.id ? poll.creator : null,
            totalVotes,
            options: optionsWithVoters,
        };
    }
    async getPollByPostId(postId, viewerId) {
        const [poll] = await this.db
            .select({ id: schema.communityPolls.id })
            .from(schema.communityPolls)
            .where((0, drizzle_orm_1.eq)(schema.communityPolls.postId, postId))
            .limit(1);
        if (!poll)
            return null;
        return this.getPollDetails(poll.id, viewerId);
    }
    async votePollOption(pollId, optionId, userId) {
        const [poll] = await this.db
            .select()
            .from(schema.communityPolls)
            .where((0, drizzle_orm_1.eq)(schema.communityPolls.id, pollId))
            .limit(1);
        if (!poll)
            return null;
        const [existing] = await this.db
            .select()
            .from(schema.communityPollVotes)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.communityPollVotes.optionId, optionId), (0, drizzle_orm_1.eq)(schema.communityPollVotes.userId, userId)))
            .limit(1);
        if (existing) {
            await this.db
                .delete(schema.communityPollVotes)
                .where((0, drizzle_orm_1.eq)(schema.communityPollVotes.id, existing.id));
            await this.db
                .update(schema.communityPollOptions)
                .set({ voteCount: (0, drizzle_orm_1.sql) `GREATEST(${schema.communityPollOptions.voteCount} - 1, 0)` })
                .where((0, drizzle_orm_1.eq)(schema.communityPollOptions.id, optionId));
        }
        else {
            if (!poll.allowMultipleAnswers) {
                const userVotes = await this.db
                    .select()
                    .from(schema.communityPollVotes)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.communityPollVotes.pollId, pollId), (0, drizzle_orm_1.eq)(schema.communityPollVotes.userId, userId)));
                for (const uv of userVotes) {
                    await this.db
                        .delete(schema.communityPollVotes)
                        .where((0, drizzle_orm_1.eq)(schema.communityPollVotes.id, uv.id));
                    await this.db
                        .update(schema.communityPollOptions)
                        .set({ voteCount: (0, drizzle_orm_1.sql) `GREATEST(${schema.communityPollOptions.voteCount} - 1, 0)` })
                        .where((0, drizzle_orm_1.eq)(schema.communityPollOptions.id, uv.optionId));
                }
            }
            await this.db.insert(schema.communityPollVotes).values({
                pollId,
                optionId,
                userId,
            });
            await this.db
                .update(schema.communityPollOptions)
                .set({ voteCount: (0, drizzle_orm_1.sql) `${schema.communityPollOptions.voteCount} + 1` })
                .where((0, drizzle_orm_1.eq)(schema.communityPollOptions.id, optionId));
        }
        return this.getPollDetails(pollId, userId);
    }
    async addPollOption(pollId, creatorId, optionText) {
        const [created] = await this.db
            .insert(schema.communityPollOptions)
            .values({
            pollId,
            creatorId,
            optionText: optionText.trim(),
        })
            .returning();
        return created ? this.getPollDetails(pollId, creatorId) : null;
    }
    async closePoll(pollId) {
        const [updated] = await this.db
            .update(schema.communityPolls)
            .set({ isClosed: true, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(schema.communityPolls.id, pollId))
            .returning();
        return updated ? this.getPollDetails(pollId) : null;
    }
    async softDeletePostsByTournamentId(tournamentId) {
        const deleted = await this.db.update(schema.communityPosts)
            .set({ deletedAt: new Date(), status: 'HIDDEN', updatedAt: new Date() })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.communityPosts.tournamentId, tournamentId), (0, drizzle_orm_1.isNull)(schema.communityPosts.deletedAt)))
            .returning();
        return deleted;
    }
};
exports.CommunitySocialRepository = CommunitySocialRepository;
exports.CommunitySocialRepository = CommunitySocialRepository = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.PG_CONNECTION)),
    __metadata("design:paramtypes", [Object])
], CommunitySocialRepository);
//# sourceMappingURL=community-social.repository.js.map