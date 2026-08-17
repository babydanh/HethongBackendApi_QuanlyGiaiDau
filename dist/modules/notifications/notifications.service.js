"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var NotificationsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationsService = void 0;
const common_1 = require("@nestjs/common");
const notifications_gateway_1 = require("./notifications.gateway");
const notifications_repository_1 = require("./notifications.repository");
const firebase_service_1 = require("../firebase/firebase.service");
let NotificationsService = NotificationsService_1 = class NotificationsService {
    notificationsRepository;
    notificationsGateway;
    firebaseService;
    logger = new common_1.Logger(NotificationsService_1.name);
    constructor(notificationsRepository, notificationsGateway, firebaseService) {
        this.notificationsRepository = notificationsRepository;
        this.notificationsGateway = notificationsGateway;
        this.firebaseService = firebaseService;
    }
    async registerDeviceToken(userId, dto) {
        return this.firebaseService.registerDeviceToken(userId, dto.token, dto.platform || 'ANDROID', dto.deviceInfo);
    }
    async removeDeviceToken(userId, dto) {
        return this.firebaseService.removeDeviceToken(userId, dto.token);
    }
    async sendNotification(data) {
        const notification = await this.notificationsRepository.createNotification(data);
        this.notificationsGateway.pushNotification(data.receiverId, notification);
        try {
            await this.firebaseService.sendPushToUser(data.receiverId, {
                title: data.title,
                body: data.content,
                data: {
                    notificationId: notification.id,
                    type: data.type,
                    redirectUrl: data.redirectUrl || '',
                },
            });
        }
        catch (err) {
            this.logger.warn(`Failed to dispatch FCM push for notification ${notification.id}: ${err?.message || err}`);
        }
        return notification;
    }
    async getMyNotifications(userId, query) {
        return this.notificationsRepository.getNotificationsByUser(userId, query);
    }
    async getUnreadCount(userId) {
        const count = await this.notificationsRepository.getUnreadCountByUser(userId);
        return { count };
    }
    async markAsRead(id, userId) {
        const notification = await this.notificationsRepository.markAsRead(id, userId);
        if (!notification) {
            throw new common_1.NotFoundException('Notification not found');
        }
        return notification;
    }
    async markAllAsRead(userId) {
        return this.notificationsRepository.markAllAsRead(userId);
    }
    async deleteByReceiverTypeAndRedirect(receiverId, type, redirectUrl) {
        return this.notificationsRepository.deleteByReceiverTypeAndRedirect(receiverId, type, redirectUrl);
    }
};
exports.NotificationsService = NotificationsService;
exports.NotificationsService = NotificationsService = NotificationsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [notifications_repository_1.NotificationsRepository,
        notifications_gateway_1.NotificationsGateway,
        firebase_service_1.FirebaseService])
], NotificationsService);
//# sourceMappingURL=notifications.service.js.map