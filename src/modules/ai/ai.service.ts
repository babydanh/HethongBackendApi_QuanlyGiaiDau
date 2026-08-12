import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import OpenAI from 'openai';
import { TournamentsService } from '../tournaments/tournaments.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MatchesService } from '../matches/matches.service';
import { PaymentsService } from '../payments/payments.service';
import { RankingsService } from '../rankings/rankings.service';
import { QueryMatchDto } from '../matches/dto/query-match.dto';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private openai: OpenAI | null = null;
  private modelName: string;
  private baseSystemPrompt: string = '';

  constructor(
    private readonly configService: ConfigService,
    private readonly tournamentsService: TournamentsService,
    private readonly notificationsService: NotificationsService,
    private readonly matchesService: MatchesService,
    private readonly paymentsService: PaymentsService,
    private readonly rankingsService: RankingsService,
  ) {
    const apiKey = this.configService.get<string>('ai.apiKey');
    const baseURL = this.configService.get<string>('ai.baseUrl') || 'https://openrouter.ai/api/v1';
    this.modelName = this.configService.get<string>('ai.modelName') || 'meta-llama/llama-3-8b-instruct:free';

    if (apiKey) {
      this.openai = new OpenAI({
        apiKey,
        baseURL,
        defaultHeaders: {
          'HTTP-Referer': 'https://vndcsport.com', // Optional, for OpenRouter rankings
          'X-Title': 'Sporto', // Optional, for OpenRouter rankings
        },
      });
    }

    // Load system prompt from file
    this.loadBaseSystemPrompt();
  }

  /**
   * Đọc system prompt từ file docs/ai-system-prompt.md
   * Nếu file không tồn tại, dùng fallback cứng.
   */
  private loadBaseSystemPrompt(): void {
    const promptPath = path.join(__dirname, '..', '..', '..', 'docs', 'ai-system-prompt.md');
    try {
      if (fs.existsSync(promptPath)) {
        this.baseSystemPrompt = fs.readFileSync(promptPath, 'utf-8');
        this.logger.log(`Đã load system prompt từ file: ${promptPath}`);
      } else {
        this.logger.warn(`Không tìm thấy file system prompt tại ${promptPath}, dùng fallback.`);
        this.baseSystemPrompt = this.getFallbackSystemPrompt();
      }
    } catch (error) {
      this.logger.error(`Lỗi đọc file system prompt: ${error.message}`);
      this.baseSystemPrompt = this.getFallbackSystemPrompt();
    }
  }

  /**
   * Helper to extract UUID from URL path
   */
  private extractTournamentId(url?: string): string | null {
    if (!url) return null;
    // Match standard UUID v4 format: e.g., /tournaments/550e8400-e29b-41d4-a716-446655440000
    const match = url.match(/\/tournaments\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
    return match ? match[1] : null;
  }

  private async buildUserContext(userId: string): Promise<string> {
    const ctxLines: string[] = [];
    ctxLines.push('\n--- THÔNG TIN CÁ NHÂN CỦA BẠN ---');

    // Chạy song song tất cả queries
    const [unreadResult, workspaceResult, rankingResult, upcomingResult] = await Promise.allSettled([
      this.notificationsService.getUnreadCount(userId),
      this.tournamentsService.getMyWorkspace(userId),
      this.rankingsService.getUserRankings(userId),
      (async () => {
        const query = new QueryMatchDto();
        query.userId = userId;
        return this.matchesService.findAll(query);
      })(),
    ]);

    // 1. Thông báo chưa đọc
    if (unreadResult.status === 'fulfilled') {
      ctxLines.push(`- Thông báo chưa đọc: ${unreadResult.value.count}`);
    }

    // 2. Workspace — phân loại role dùng getMyWorkspace
    const ACTIVE_STATUSES = ['IN_PROGRESS', 'REGISTRATION_OPEN', 'UPCOMING'] as const;
    const isActive = (t: { status?: string }) => t.status && ACTIVE_STATUSES.includes(t.status as typeof ACTIVE_STATUSES[number]);

    if (workspaceResult.status === 'fulfilled') {
      const w = workspaceResult.value;

      const orgActive = (w.organizedTournaments || []).filter(isActive);
      const partActive = (w.participatingTournaments || []).filter(isActive);
      const coOrgActive = (w.coOrganizerTournaments || []).filter(isActive);
      const refTournaments = w.refereeTournaments || [];
      const refInvites = w.refereeInvites || [];

      ctxLines.push(`- Vai trò hiện tại: ${orgActive.length > 0 ? 'Ban tổ chức' : partActive.length > 0 ? 'Vận động viên' : 'Người dùng'}`);

      if (orgActive.length > 0) {
        ctxLines.push(`- Giải đang tổ chức (${orgActive.length}):`);
        orgActive.slice(0, 3).forEach((t: any) => {
          const st = t.status === 'IN_PROGRESS' ? '🟢 Đang đấu' : t.status === 'REGISTRATION_OPEN' ? '📝 Đang đăng ký' : '⏳ Sắp diễn ra';
          ctxLines.push(`  • ${t.name || 'Không tên'} — ${st}`);
        });
      }

      if (partActive.length > 0) {
        ctxLines.push(`- Giải đang tham gia (${partActive.length}):`);
        partActive.slice(0, 3).forEach((t: any) => {
          const st = t.status === 'IN_PROGRESS' ? '🟢 Đang đấu' : t.status === 'REGISTRATION_OPEN' ? '📝 Đang đăng ký' : '⏳ Sắp diễn ra';
          ctxLines.push(`  • ${t.name || 'Không tên'} — ${st}`);
        });
      }

      if (coOrgActive.length > 0) {
        ctxLines.push(`- Đồng tổ chức: ${coOrgActive.length} giải`);
      }

      if (refInvites.length > 0) {
        ctxLines.push(`- Lời mời làm trọng tài: ${refInvites.length} lời mời`);
      }
    }

    // 3. ELO hiện tại
    if (rankingResult.status === 'fulfilled' && rankingResult.value?.publicRanks?.length > 0) {
      const top = rankingResult.value.publicRanks[0];
      ctxLines.push(`- ELO hiện tại: ${top.eloPoints ?? 'Chưa có'} (${top.tierName || 'Chưa xếp hạng'})`);
    }

    // 4. Trận sắp tới
    if (upcomingResult.status === 'fulfilled') {
      const matches = upcomingResult.value;
      if (Array.isArray(matches)) {
        const upcoming = matches.filter((m: { status?: string }) => m.status === 'SCHEDULED').slice(0, 3);
        if (upcoming.length > 0) {
          ctxLines.push('- Trận sắp tới:');
          upcoming.forEach((m: any) => {
            const time = m.scheduledAt ? new Date(m.scheduledAt).toLocaleString('vi-VN') : 'Chưa xếp lịch';
            ctxLines.push(`  • ${m.participant1?.teamName || 'TBD'} vs ${m.participant2?.teamName || 'TBD'} — ${time}`);
          });
        }
      }
    }

    ctxLines.push('---');
    return ctxLines.join('\n');
  }

  /**
   * System prompt fallback khi không đọc được file
   */
  private getFallbackSystemPrompt(): string {
    return `Bạn là Trợ lý ảo AI của nền tảng quản lý giải đấu thể thao Sporto.
Bạn hỗ trợ người dùng về tạo giải đấu, quản lý giải, đăng ký thi đấu, ELO, thanh toán, và các thao tác trên hệ thống.
Trả lời bằng tiếng Việt, lịch sự, chính xác, có cấu trúc.`;
  }

  private buildSystemPromptWithContext(tournamentContext: string, userContext: string): string {
    return `${this.baseSystemPrompt}

${tournamentContext}

${userContext}`;
  }

  private async buildOpenAiMessages(
    messages: any[],
    userId?: string,
    currentUrl?: string,
    pageTitle?: string,
    isMobile?: boolean,
    searchParams?: string,
  ): Promise<OpenAI.Chat.ChatCompletionMessageParam[]> {
    let pageContext = '';
    const tournamentId = this.extractTournamentId(currentUrl);

    if (tournamentId) {
      try {
        const tournament = await this.tournamentsService.findOne(tournamentId, userId);
        if (tournament) {
          const divisionsStr = tournament.divisions && tournament.divisions.length > 0
            ? tournament.divisions.map((d: any) => {
                const configStr = d.bracketType ? `, Thể thức: ${d.bracketType}` : '';
                const eloStr = d.minElo || d.maxElo ? ` (ELO: ${d.minElo || 0} - ${d.maxElo || 'Không giới hạn'})` : '';
                const feeStr = d.entryFee > 0 ? `, Phí: ${Number(d.entryFee).toLocaleString('vi-VN')}đ` : ', Miễn phí';
                return `  - Bảng ${d.name}: ${d.matchType}${d.genderRestriction ? ` (${d.genderRestriction})` : ''}${configStr}${eloStr}${feeStr}`;
              }).join('\n')
            : '  Không có bảng đấu cụ thể.';

          const statusMap: Record<string, string> = {
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
      } catch (error) {
        console.error('Error fetching tournament context for AI chat:', error);
      }
    }

    // Thêm context về trang hiện tại (pageTitle, device type, search params)
    if (pageTitle || isMobile !== undefined || searchParams) {
      const deviceLabel = isMobile ? 'Điện thoại' : 'Máy tính';
      pageContext += `\n--- TRANG HIỆN TẠI ---\n`;
      if (pageTitle) pageContext += `- Bạn đang ở: ${pageTitle}\n`;
      pageContext += `- Thiết bị: ${deviceLabel}\n`;
      if (searchParams) pageContext += `- Query params: ${searchParams}\n`;
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
        const role: 'user' | 'assistant' = m.role === 'user' ? 'user' : 'assistant';
        return {
          role,
          content: String(m.content),
        };
      }),
    ];
  }

  async getChatResponse(
    messages: any[],
    userId?: string,
    currentUrl?: string,
    pageTitle?: string,
    isMobile?: boolean,
    searchParams?: string,
  ): Promise<string> {
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
    } catch (error: any) {
      console.error('OpenRouter AI Chat Error:', error);
      throw new InternalServerErrorException('Lỗi kết nối với máy chủ AI: ' + error.message);
    }
  }

  async getChatResponseStream(
    messages: any[],
    userId?: string,
    currentUrl?: string,
    pageTitle?: string,
    isMobile?: boolean,
    searchParams?: string,
  ) {
    if (!this.openai) {
      throw new InternalServerErrorException('Hệ thống trợ lý AI hiện chưa được cấu hình API Key từ OpenRouter. Vui lòng liên hệ quản trị viên.');
    }

    try {
      const openAiMessages = await this.buildOpenAiMessages(messages, userId, currentUrl, pageTitle, isMobile, searchParams);

      return await this.openai.chat.completions.create({
        model: this.modelName,
        messages: openAiMessages,
        stream: true,
      });
    } catch (error: any) {
      console.error('OpenRouter AI Chat Stream Error:', error);
      throw new InternalServerErrorException('Lỗi kết nối stream với máy chủ AI: ' + error.message);
    }
  }
}

