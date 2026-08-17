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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const public_decorator_1 = require("../../common/decorators/public.decorator");
const ai_service_1 = require("./ai.service");
const rate_limit_guard_1 = require("../../common/guards/rate-limit.guard");
let AiController = class AiController {
    aiService;
    constructor(aiService) {
        this.aiService = aiService;
    }
    getUserIdFromRequest(request) {
        if (!request || !request.headers)
            return undefined;
        const authHeader = request.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return undefined;
        }
        const token = authHeader.split(' ')[1];
        try {
            const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('ascii'));
            return payload.sub || undefined;
        }
        catch {
            return undefined;
        }
    }
    async chat(messages, currentUrl, pageTitle, isMobile, searchParams, req, res) {
        const userId = req ? this.getUserIdFromRequest(req) : undefined;
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        try {
            const stream = await this.aiService.getChatResponseStream(messages || [], userId, currentUrl, pageTitle, isMobile, searchParams);
            for await (const chunk of stream) {
                const content = chunk.choices[0]?.delta?.content || '';
                if (content) {
                    res.write(`data: ${JSON.stringify({ content })}\n\n`);
                }
            }
            res.write('data: [DONE]\n\n');
            res.end();
        }
        catch (error) {
            res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
            res.end();
        }
    }
};
exports.AiController = AiController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('chat'),
    (0, common_1.UseGuards)(new rate_limit_guard_1.RateLimitGuard(12, 60000)),
    (0, swagger_1.ApiOperation)({ summary: 'Gửi tin nhắn hội thoại và nhận phản hồi từ Trợ lý ảo AI' }),
    __param(0, (0, common_1.Body)('messages')),
    __param(1, (0, common_1.Body)('currentUrl')),
    __param(2, (0, common_1.Body)('pageTitle')),
    __param(3, (0, common_1.Body)('isMobile')),
    __param(4, (0, common_1.Body)('searchParams')),
    __param(5, (0, common_1.Req)()),
    __param(6, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Array, String, String, Boolean, String, Object, Object]),
    __metadata("design:returntype", Promise)
], AiController.prototype, "chat", null);
exports.AiController = AiController = __decorate([
    (0, swagger_1.ApiTags)('ai'),
    (0, common_1.Controller)('ai'),
    __metadata("design:paramtypes", [ai_service_1.AiService])
], AiController);
//# sourceMappingURL=ai.controller.js.map