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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var AiService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const openai_1 = __importDefault(require("openai"));
const tournaments_service_1 = require("../tournaments/tournaments.service");
const notifications_service_1 = require("../notifications/notifications.service");
const matches_service_1 = require("../matches/matches.service");
const payments_service_1 = require("../payments/payments.service");
const rankings_service_1 = require("../rankings/rankings.service");
const query_match_dto_1 = require("../matches/dto/query-match.dto");
let AiService = AiService_1 = class AiService {
    configService;
    tournamentsService;
    notificationsService;
    matchesService;
    paymentsService;
    rankingsService;
    logger = new common_1.Logger(AiService_1.name);
    openai = null;
    modelName;
    baseSystemPrompt = '';
    constructor(configService, tournamentsService, notificationsService, matchesService, paymentsService, rankingsService) {
        this.configService = configService;
        this.tournamentsService = tournamentsService;
        this.notificationsService = notificationsService;
        this.matchesService = matchesService;
        this.paymentsService = paymentsService;
        this.rankingsService = rankingsService;
        const apiKey = this.configService.get('ai.apiKey');
        const baseURL = this.configService.get('ai.baseUrl') || 'https://openrouter.ai/api/v1';
        this.modelName = this.configService.get('ai.modelName') || 'meta-llama/llama-3-8b-instruct:free';
        if (apiKey) {
            this.openai = new openai_1.default({
                apiKey,
                baseURL,
                defaultHeaders: {
                    'HTTP-Referer': 'https://vndcsport.com',
                    'X-Title': 'Sporto',
                },
            });
        }
        this.loadBaseSystemPrompt();
    }
    loadBaseSystemPrompt() {
        const promptPath = path.join(__dirname, '..', '..', '..', 'docs', 'ai-system-prompt.md');
        try {
            if (fs.existsSync(promptPath)) {
                this.baseSystemPrompt = fs.readFileSync(promptPath, 'utf-8');
                this.logger.log(`Đã load system prompt từ file: ${promptPath}`);
            }
            else {
                this.logger.warn(`Không tìm thấy file system prompt tại ${promptPath}, dùng fallback.`);
                this.baseSystemPrompt = this.getFallbackSystemPrompt();
            }
        }
        catch (error) {
            this.logger.error(`Lỗi đọc file system prompt: ${error.message}`);
            this.baseSystemPrompt = this.getFallbackSystemPrompt();
        }
    }
    extractTournamentId(url) {
        if (!url)
            return null;
        const match = url.match(/\/tournaments\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
        return match ? match[1] : null;
    }
    async buildUserContext(userId) {
        const ctxLines = [];
        ctxLines.push('\n--- THÔNG TIN CÁ NHÂN CỦA BẠN ---');
        const [unreadResult, workspaceResult, rankingResult, upcomingResult] = await Promise.allSettled([
            this.notificationsService.getUnreadCount(userId),
            this.tournamentsService.getMyWorkspace(userId),
            this.rankingsService.getUserRankings(userId),
            (async () => {
                const query = new query_match_dto_1.QueryMatchDto();
                query.userId = userId;
                return this.matchesService.findAll(query);
            })(),
        ]);
        if (unreadResult.status === 'fulfilled') {
            ctxLines.push(`- Thông báo chưa đọc: ${unreadResult.value.count}`);
        }
        const ACTIVE_STATUSES = ['IN_PROGRESS', 'REGISTRATION_OPEN', 'UPCOMING'];
        const isActive = (t) => t.status && ACTIVE_STATUSES.includes(t.status);
        if (workspaceResult.status === 'fulfilled') {
            const w = workspaceResult.value;
            const orgActive = (w.organizedTournaments || []).filter(isActive);
            const partActive = (w.participatingTournaments || []).filter(isActive);
            const coOrgActive = (w.coOrganizerTournaments || []).filter(isActive);
            const refActive = (w.refereeTournaments || []).filter(isActive);
            const refInvites = w.refereeInvites || [];
            ctxLines.push(`- Vai trò hiện tại: ${orgActive.length > 0 ? 'Ban tổ chức' : refActive.length > 0 ? 'Trọng tài' : partActive.length > 0 ? 'Vận động viên' : 'Người dùng'}`);
            if (orgActive.length > 0) {
                ctxLines.push(`- Giải đang tổ chức (${orgActive.length}):`);
                orgActive.slice(0, 3).forEach((t) => {
                    const st = t.status === 'IN_PROGRESS' ? '🟢 Đang đấu' : t.status === 'REGISTRATION_OPEN' ? '📝 Đang đăng ký' : '⏳ Sắp diễn ra';
                    ctxLines.push(`  • ${t.name || 'Không tên'} — ${st}`);
                });
            }
            if (partActive.length > 0) {
                ctxLines.push(`- Giải đang tham gia (${partActive.length}):`);
                partActive.slice(0, 3).forEach((t) => {
                    const st = t.status === 'IN_PROGRESS' ? '🟢 Đang đấu' : t.status === 'REGISTRATION_OPEN' ? '📝 Đang đăng ký' : '⏳ Sắp diễn ra';
                    ctxLines.push(`  • ${t.name || 'Không tên'} — ${st}`);
                });
            }
            if (coOrgActive.length > 0) {
                ctxLines.push(`- Đồng tổ chức: ${coOrgActive.length} giải`);
            }
            if (refActive.length > 0) {
                ctxLines.push(`- Trọng tài: ${refActive.length} giải`);
            }
            if (refInvites.length > 0) {
                ctxLines.push(`- Lời mời làm trọng tài: ${refInvites.length} lời mời`);
            }
        }
        if (rankingResult.status === 'fulfilled' && rankingResult.value?.publicRanks?.length > 0) {
            const top = rankingResult.value.publicRanks[0];
            ctxLines.push(`- ELO hiện tại: ${top.eloPoints ?? 'Chưa có'} (${top.tierName || 'Chưa xếp hạng'})`);
        }
        if (upcomingResult.status === 'fulfilled') {
            const matches = upcomingResult.value;
            if (Array.isArray(matches)) {
                const upcoming = matches.filter((m) => m.status === 'SCHEDULED').slice(0, 3);
                if (upcoming.length > 0) {
                    ctxLines.push('- Trận sắp tới:');
                    upcoming.forEach((m) => {
                        const time = m.scheduledAt ? new Date(m.scheduledAt).toLocaleString('vi-VN') : 'Chưa xếp lịch';
                        ctxLines.push(`  • ${m.participant1?.teamName || 'TBD'} vs ${m.participant2?.teamName || 'TBD'} — ${time}`);
                    });
                }
            }
        }
        ctxLines.push('---');
        return ctxLines.join('\n');
    }
    getFallbackSystemPrompt() {
        return `Bạn là Trợ lý ảo AI của nền tảng quản lý giải đấu thể thao Sporto.
Bạn hỗ trợ người dùng về tạo giải đấu, quản lý giải, đăng ký thi đấu, ELO, thanh toán, và các thao tác trên hệ thống.
Trả lời bằng tiếng Việt, lịch sự, chính xác, có cấu trúc.`;
    }
    buildSystemPromptWithContext(tournamentContext, userContext) {
        return `${this.baseSystemPrompt}

${tournamentContext}

${userContext}`;
    }
    async buildOpenAiMessages(messages, userId, currentUrl, pageTitle, isMobile, searchParams) {
        let pageContext = '';
        const tournamentId = this.extractTournamentId(currentUrl);
        if (tournamentId) {
            try {
                const tournament = await this.tournamentsService.findOne(tournamentId, userId);
                if (tournament) {
                    const divisionsStr = tournament.divisions && tournament.divisions.length > 0
                        ? tournament.divisions.map((d) => {
                            const configStr = d.bracketType ? `, Thể thức: ${d.bracketType}` : '';
                            const eloStr = d.minElo || d.maxElo ? ` (ELO: ${d.minElo || 0} - ${d.maxElo || 'Không giới hạn'})` : '';
                            const feeStr = d.entryFee > 0 ? `, Phí: ${Number(d.entryFee).toLocaleString('vi-VN')}đ` : ', Miễn phí';
                            return `  - Bảng ${d.name}: ${d.matchType}${d.genderRestriction ? ` (${d.genderRestriction})` : ''}${configStr}${eloStr}${feeStr}`;
                        }).join('\n')
                        : '  Không có bảng đấu cụ thể.';
                    const statusMap = {
                        DRAFT: 'Bản nháp', UPCOMING: 'Sắp diễn ra', REGISTRATION_OPEN: 'Đang mở đăng ký',
                        REGISTRATION_CLOSED: 'Đã đóng đăng ký', IN_PROGRESS: 'Đang thi đấu',
                        COMPLETED: 'Đã kết thúc', CANCELLED: 'Đã hủy',
                    };
                    const tournamentInfo = [
                        `- Tên giải: ${tournament.name}`,
                        `- Trạng thái: ${statusMap[tournament.status] || tournament.status}`,
                        `- Môn thể thao: ${tournament.category?.name || 'Chưa xác định'}`,
                        `- Loại giải: ${tournament.tournamentType === 'CLUB' ? 'Giải nội bộ CLB' : 'Giải công khai'}`,
                        `- Thể loại chính: ${tournament.matchType === 'SINGLES' ? 'Đánh đơn' : tournament.matchType === 'DOUBLES' ? 'Đánh đôi' : 'Đôi nam nữ'}`,
                        tournament.isRanked === false ? `- Tính điểm: Giải phong trào (Không ELO)` : `- Tính điểm: Có xếp hạng (Tính ELO)`,
                        `- Hiển thị: ${tournament.visibility === 'PUBLIC' ? 'Công khai' : 'Không niêm yết'}`,
                        `- Số đội tối đa: ${tournament.maxParticipants || 'Không giới hạn'}`,
                        `- Lệ phí: ${Number(tournament.entryFee || 0) > 0 ? Number(tournament.entryFee).toLocaleString('vi-VN') + 'đ' : 'Miễn phí'}`,
                        tournament.registrationStartDate ? `- Mở đăng ký: ${new Date(tournament.registrationStartDate).toLocaleDateString('vi-VN')}` : '',
                        tournament.registrationEndDate ? `- Đóng đăng ký: ${new Date(tournament.registrationEndDate).toLocaleDateString('vi-VN')}` : '',
                        tournament.startDate ? `- Bắt đầu: ${new Date(tournament.startDate).toLocaleDateString('vi-VN')}` : '',
                        tournament.endDate ? `- Kết thúc: ${new Date(tournament.endDate).toLocaleDateString('vi-VN')}` : '',
                        `- Địa điểm: ${tournament.venue?.name || 'Chưa cập nhật'}${tournament.venue?.locationAddress ? ` (${tournament.venue.locationAddress})` : ''}`,
                        `- Người tạo: ${tournament.organizer?.fullName || 'Chưa xác định'}`,
                        tournament.description ? `- Mô tả: ${tournament.description.replace(/\n/g, ' ').substring(0, 200)}${tournament.description.length > 200 ? '...' : ''}` : '',
                        tournament.prizeDescription ? `- Giải thưởng: ${tournament.prizeDescription.replace(/\n/g, ' ').substring(0, 200)}` : '',
                        tournament._summary?.participantCount !== undefined ? `- Số đội đã đăng ký: ${tournament._summary.participantCount}` : '',
                    ].filter(Boolean).join('\n');
                    pageContext += `
--- THÔNG TIN GIẢI ĐẤU HIỆN TẠI ---
Người dùng đang xem trang giải đấu sau:

${tournamentInfo}

--- CÁC BẢNG ĐẤU (DIVISIONS) ---
${divisionsStr}
---`;
                }
            }
            catch (error) {
                console.error('Error fetching tournament context for AI chat:', error);
            }
        }
        if (pageTitle || isMobile !== undefined || searchParams) {
            const deviceLabel = isMobile ? 'Điện thoại' : 'Máy tính';
            pageContext += `\n--- TRANG HIỆN TẠI ---\n`;
            if (pageTitle)
                pageContext += `- Bạn đang ở: ${pageTitle}\n`;
            pageContext += `- Thiết bị: ${deviceLabel}\n`;
            if (searchParams)
                pageContext += `- Query params: ${searchParams}\n`;
            pageContext += `---\n`;
        }
        let userContext = '';
        if (userId) {
            userContext = await this.buildUserContext(userId);
        }
        const systemPrompt = this.buildSystemPromptWithContext(pageContext, userContext);
        return [
            { role: 'system', content: systemPrompt },
            ...messages.map((m) => {
                const role = m.role === 'user' ? 'user' : 'assistant';
                return {
                    role,
                    content: String(m.content),
                };
            }),
        ];
    }
    async getChatResponse(messages, userId, currentUrl, pageTitle, isMobile, searchParams) {
        if (!this.openai) {
            return 'Hệ thống trợ lý AI hiện chưa được cấu hình API Key từ OpenRouter. Vui lòng liên hệ quản trị viên.';
        }
        try {
            const openAiMessages = await this.buildOpenAiMessages(messages, userId, currentUrl, pageTitle, isMobile, searchParams);
            const response = await this.openai.chat.completions.create({
                model: this.modelName,
                messages: openAiMessages,
            });
            return response.choices[0]?.message?.content || 'Trợ lý AI chưa phản hồi. Vui lòng thử lại sau.';
        }
        catch (error) {
            console.error('OpenRouter AI Chat Error:', error);
            throw new common_1.InternalServerErrorException('Lỗi kết nối với máy chủ AI: ' + error.message);
        }
    }
    async getChatResponseStream(messages, userId, currentUrl, pageTitle, isMobile, searchParams) {
        if (!this.openai) {
            throw new common_1.InternalServerErrorException('Hệ thống trợ lý AI hiện chưa được cấu hình API Key từ OpenRouter. Vui lòng liên hệ quản trị viên.');
        }
        try {
            const openAiMessages = await this.buildOpenAiMessages(messages, userId, currentUrl, pageTitle, isMobile, searchParams);
            return await this.openai.chat.completions.create({
                model: this.modelName,
                messages: openAiMessages,
                stream: true,
            });
        }
        catch (error) {
            console.error('OpenRouter AI Chat Stream Error:', error);
            throw new common_1.InternalServerErrorException('Lỗi kết nối stream với máy chủ AI: ' + error.message);
        }
    }
    async parseTournamentSource(dto) {
        let sourceContent = dto.rawText?.trim() || '';
        if (dto.sourceUrl?.trim()) {
            try {
                const response = await fetch(dto.sourceUrl.trim(), {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    },
                    signal: AbortSignal.timeout(10000),
                });
                if (response.ok) {
                    const html = await response.text();
                    const textOnly = html
                        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
                        .replace(/<[^>]+>/g, ' ')
                        .replace(/\s+/g, ' ')
                        .trim();
                    if (textOnly.length > 50) {
                        sourceContent = `[NỘI DUNG TẢI TỪ URL: ${dto.sourceUrl}]\n${textOnly.slice(0, 8000)}\n\n${sourceContent}`;
                    }
                }
            }
            catch (err) {
                this.logger.warn(`Could not fetch tournament sourceUrl (${dto.sourceUrl}): ${err.message}`);
            }
        }
        if (!sourceContent) {
            throw new common_1.BadRequestException('Không thể đọc nội dung từ link hoặc nội dung trống. Vui lòng cung cấp link hoặc dán trực tiếp điều lệ giải để AI phân tích.');
        }
        const systemPrompt = `Bạn là chuyên gia phân tích dữ liệu giải đấu thể thao cho nền tảng Sporto / Quản lý giải đấu.
Nhiệm vụ của bạn là đọc thông tin / điều lệ / form đăng ký giải đấu và trích xuất cấu trúc JSON chuẩn xác.

Quy tắc phân loại:
1. "sport": một trong ['pickleball', 'badminton', 'tennis', 'table_tennis', 'football']. Mặc định 'pickleball' nếu không rõ.
2. "name": Tên chính thức của giải đấu.
3. "startDate", "endDate": Chuỗi ISO 8601 YYYY-MM-DD hoặc null nếu không rõ.
4. "venueName": Tên sân vận động / cụm sân.
5. "locationAddress": Địa chỉ sân.
6. "province": Tỉnh / Thành phố diễn ra giải (VD: "Hồ Chí Minh", "Hà Nội", "Đà Nẵng",...).
7. "description": Tóm tắt quy định, điều lệ hoặc thông tin giải đấu.
8. "bannerUrl": Link ảnh banner/poster nếu tìm thấy trong văn bản (hoặc null).
9. "formats": Danh sách các nội dung thi đấu (Divisions). Mỗi mục gồm:
   - "name": Tên hiển thị (VD: "Đôi Nam 6.5", "Đôi Nam Nữ Open", "Đơn Nam 3.0", "Đôi Nữ")
   - "formatKey": Chuẩn hóa theo một trong các giá trị:
     + "SINGLES_MALE", "SINGLES_FEMALE", "DOUBLES_MALE", "DOUBLES_FEMALE", "MIXED_DOUBLES"
     + Hoặc môn bóng đá: "FOOTBALL_MALE", "FOOTBALL_FEMALE", "FOOTBALL_OPEN"
   - "bracketType": "SINGLE_ELIMINATION" | "DOUBLE_ELIMINATION" | "ROUND_ROBIN" | "GROUP_STAGE_KNOCKOUT" (mặc định "SINGLE_ELIMINATION" nếu không rõ)
   - "maxParticipants": Số lượng VĐV hoặc Cặp tối đa (mặc định 16 hoặc 32)
   - "minElo": Số ELO tối thiểu (hoặc null)
   - "maxElo": Số ELO tối đa (hoặc null)

QUAN TRỌNG: Chỉ trả về duy nhất chuỗi JSON hợp lệ theo định dạng yêu cầu. Không bọc trong \`\`\`json\`\`\`, không giải thích thêm.`;
        if (!this.openai) {
            return {
                name: 'Giải Đấu Thể Thao Mới',
                sport: dto.sportHint || 'pickleball',
                startDate: null,
                endDate: null,
                venueName: null,
                locationAddress: null,
                province: null,
                description: sourceContent.slice(0, 500),
                bannerUrl: null,
                formats: [
                    {
                        name: 'Đôi Nam',
                        formatKey: 'DOUBLES_MALE',
                        bracketType: 'SINGLE_ELIMINATION',
                        maxParticipants: 16,
                        minElo: null,
                        maxElo: null,
                    },
                    {
                        name: 'Đôi Nam Nữ',
                        formatKey: 'MIXED_DOUBLES',
                        bracketType: 'SINGLE_ELIMINATION',
                        maxParticipants: 16,
                        minElo: null,
                        maxElo: null,
                    },
                ],
            };
        }
        try {
            const response = await this.openai.chat.completions.create({
                model: this.modelName,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: `Hãy phân tích nội dung giải đấu sau đây:\n\n${sourceContent}` },
                ],
                temperature: 0.1,
            });
            const rawResult = response.choices[0]?.message?.content?.trim() || '{}';
            const jsonMatch = rawResult.match(/\{[\s\S]*\}/);
            const cleanJson = jsonMatch ? jsonMatch[0] : rawResult;
            const parsed = JSON.parse(cleanJson);
            return {
                name: parsed.name || 'Giải đấu thể thao',
                sport: ['pickleball', 'badminton', 'tennis', 'table_tennis', 'football'].includes(parsed.sport)
                    ? parsed.sport
                    : dto.sportHint || 'pickleball',
                startDate: parsed.startDate || null,
                endDate: parsed.endDate || null,
                venueName: parsed.venueName || null,
                locationAddress: parsed.locationAddress || null,
                province: parsed.province || null,
                description: parsed.description || null,
                bannerUrl: parsed.bannerUrl || null,
                formats: Array.isArray(parsed.formats) && parsed.formats.length > 0
                    ? parsed.formats.map((f) => ({
                        name: f.name || 'Nội dung thi đấu',
                        formatKey: f.formatKey || 'DOUBLES_MALE',
                        bracketType: f.bracketType || 'SINGLE_ELIMINATION',
                        maxParticipants: typeof f.maxParticipants === 'number' ? f.maxParticipants : 16,
                        minElo: typeof f.minElo === 'number' ? f.minElo : null,
                        maxElo: typeof f.maxElo === 'number' ? f.maxElo : null,
                    }))
                    : [
                        {
                            name: 'Đôi Nam',
                            formatKey: 'DOUBLES_MALE',
                            bracketType: 'SINGLE_ELIMINATION',
                            maxParticipants: 16,
                            minElo: null,
                            maxElo: null,
                        },
                    ],
            };
        }
        catch (error) {
            this.logger.error(`Lỗi phân tích AI Tournament: ${error.message}`);
            throw new common_1.InternalServerErrorException(`Không thể phân tích nội dung giải: ${error.message}`);
        }
    }
};
exports.AiService = AiService;
exports.AiService = AiService = AiService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        tournaments_service_1.TournamentsService,
        notifications_service_1.NotificationsService,
        matches_service_1.MatchesService,
        payments_service_1.PaymentsService,
        rankings_service_1.RankingsService])
], AiService);
//# sourceMappingURL=ai.service.js.map