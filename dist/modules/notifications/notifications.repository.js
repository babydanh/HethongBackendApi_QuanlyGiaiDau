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
exports.NotificationsRepository = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const database_module_1 = require("../../database/database.module");
const schema = __importStar(require("../../database/schema"));
const cursor_pagination_helper_1 = require("../../common/helpers/cursor-pagination.helper");
let NotificationsRepository = class NotificationsRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    async createNotification(data) {
        const [record] = await this.db
            .insert(schema.notifications)
            .values({
            receiverId: data.receiverId,
            senderId: data.senderId,
            type: data.type,
            title: data.title,
            content: data.content,
            redirectUrl: data.redirectUrl,
        })
            .returning();
        return record;
    }
    async getNotificationsByUser(userId, query) {
        const { page = 1, limit = 10, cursor, isRead } = query;
        const conditions = [(0, drizzle_orm_1.eq)(schema.notifications.receiverId, userId)];
        if (isRead !== undefined) {
            conditions.push((0, drizzle_orm_1.eq)(schema.notifications.isRead, isRead));
        }
        const baseWhereClause = (0, drizzle_orm_1.and)(...conditions);
        const decodedCursor = cursor
            ? cursor_pagination_helper_1.CursorPaginationHelper.decodeCursor(cursor)
            : null;
        if (decodedCursor) {
            conditions.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.lt)(schema.notifications.createdAt, new Date(decodedCursor.createdAt)), (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.notifications.createdAt, new Date(decodedCursor.createdAt)), (0, drizzle_orm_1.lt)(schema.notifications.id, decodedCursor.id))));
        }
        const whereClause = (0, drizzle_orm_1.and)(...conditions);
        const [totalRecord] = await this.db
            .select({ count: (0, drizzle_orm_1.count)() })
            .from(schema.notifications)
            .where(baseWhereClause);
        const notificationsQuery = this.db
            .select()
            .from(schema.notifications)
            .where(whereClause)
            .orderBy((0, drizzle_orm_1.desc)(schema.notifications.createdAt), (0, drizzle_orm_1.desc)(schema.notifications.id))
            .limit(limit + 1)
            .$dynamic();
        const rawData = await notificationsQuery;
        const hasMore = rawData.length > limit;
        const data = hasMore ? rawData.slice(0, limit) : rawData;
        return {
            data,
            meta: {
                total: totalRecord.count,
                page,
                limit,
                totalPages: Math.ceil(totalRecord.count / limit),
                nextCursor: hasMore && data.length > 0
                    ? cursor_pagination_helper_1.CursorPaginationHelper.encodeCursor({ id: data[data.length - 1].id, createdAt: data[data.length - 1].createdAt })
                    : null,
                hasMore,
            },
        };
    }
    async getUnreadCountByUser(userId) {
        const [totalRecord] = await this.db
            .select({ count: (0, drizzle_orm_1.count)() })
            .from(schema.notifications)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.notifications.receiverId, userId), (0, drizzle_orm_1.eq)(schema.notifications.isRead, false)));
        return totalRecord.count;
    }
    async markAsRead(id, userId) {
        const [updated] = await this.db
            .update(schema.notifications)
            .set({ isRead: true })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.notifications.id, id), (0, drizzle_orm_1.eq)(schema.notifications.receiverId, userId)))
            .returning();
        return updated;
    }
    async markAllAsRead(userId) {
        return this.db
            .update(schema.notifications)
            .set({ isRead: true })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.notifications.receiverId, userId), (0, drizzle_orm_1.eq)(schema.notifications.isRead, false)))
            .returning();
    }
    async deleteByReceiverTypeAndRedirect(receiverId, type, redirectUrl) {
        return this.db
            .delete(schema.notifications)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.notifications.receiverId, receiverId), (0, drizzle_orm_1.eq)(schema.notifications.type, type), (0, drizzle_orm_1.eq)(schema.notifications.redirectUrl, redirectUrl)))
            .returning();
    }
};
exports.NotificationsRepository = NotificationsRepository;
exports.NotificationsRepository = NotificationsRepository = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.PG_CONNECTION)),
    __metadata("design:paramtypes", [Object])
], NotificationsRepository);
//# sourceMappingURL=notifications.repository.js.map