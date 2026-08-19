import { Injectable, InternalServerErrorException, BadRequestException, Logger } from '@nestjs/common';
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
          'HTTP-Referer': 'https://vndcsport.com',
          'X-Title': 'Sporto',
        },
      });
    }

    this.loadBaseSystemPrompt();
  }

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
    } catch (error: any) {
      this.logger.error(`Lỗi đọc file system prompt: ${error.message}`);
      this.baseSystemPrompt = this.getFallbackSystemPrompt();
    }
  }

  private extractTournamentId(url?: string): string | null {
    if (!url) return null;
    const match = url.match(/\/tournaments\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
    return match ? match[1] : null;
  }

  private async buildUserContext(userId: string): Promise<string> {
    const ctxLines: string[] = [];
    ctxLines.push('\n--- THÔNG TIN CÁ NHÂN CỦA BẠN ---');

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

    if (unreadResult.status === 'fulfilled') {
      ctxLines.push(`- Thông báo chưa đọc: ${unreadResult.value.count}`);
    }

    const ACTIVE_STATUSES = ['IN_PROGRESS', 'REGISTRATION_OPEN', 'UPCOMING'] as const;
    const isActive = (t: { status?: string }) => t.status && ACTIVE_STATUSES.includes(t.status as typeof ACTIVE_STATUSES[number]);

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

  async parseTournamentSource(dto: {
    sourceUrl?: string;
    rawText?: string;
    sportHint?: string;
  }): Promise<{
    name: string;
    sport: 'badminton' | 'tennis' | 'pickleball' | 'table_tennis' | 'football';
    startDate?: string | null;
    endDate?: string | null;
    venueName?: string | null;
    locationAddress?: string | null;
    province?: string | null;
    description?: string | null;
    bannerUrl?: string | null;
    formats: Array<{
      name: string;
      formatKey: string;
      bracketType?: 'SINGLE_ELIMINATION' | 'DOUBLE_ELIMINATION' | 'ROUND_ROBIN' | 'GROUP_STAGE_KNOCKOUT' | null;
      maxParticipants?: number | null;
      minElo?: number | null;
      maxElo?: number | null;
    }>;
    registrationFormFields: Array<{
      id: string;
      label: string;
      type: 'TEXT' | 'TEXTAREA' | 'EMAIL' | 'PHONE' | 'NUMBER' | 'SELECT' | 'MULTI_SELECT' | 'CHECKBOX' | 'FILE';
      required: boolean;
      helpText?: string;
      options?: string[];
      min?: number;
      max?: number;
      acceptedFileTypes?: string[];
      maxFileSizeMb?: number;
      confidence?: number;
      needsReview?: boolean;
    }>;
  }> {
    let sourceContent = dto.rawText?.trim() || '';

    // If a URL is provided, try to fetch its text content
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
          // Google Forms keeps question labels/options in an embedded JSON payload,
          // not only in visible HTML. Preserve that payload for semantic extraction.
          const embeddedData = Array.from(html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi))
            .map((match) => match[1])
            .filter((script) => script.includes('FB_PUBLIC_LOAD_DATA_') || script.includes('FORM_ID'))
            .join('\n')
            .slice(0, 24000);
          const textOnly = html
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          if (textOnly.length > 50) {
            sourceContent = `[NỘI DUNG TẢI TỪ URL: ${dto.sourceUrl}]\n${textOnly.slice(0, 24000)}\n${embeddedData ? `\n[DỮ LIỆU NHÚNG CỦA GOOGLE FORM]\n${embeddedData}` : ''}\n\n${sourceContent}`;
          }
        }
      } catch (err: any) {
        this.logger.warn(`Could not fetch tournament sourceUrl (${dto.sourceUrl}): ${err.message}`);
      }
    }

    if (!sourceContent) {
      throw new BadRequestException('Không thể đọc nội dung từ link hoặc nội dung trống. Vui lòng cung cấp link hoặc dán trực tiếp điều lệ giải để AI phân tích.');
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
10. "registrationFormFields": Toàn bộ câu hỏi/ô nhập liệu được tìm thấy trong form đăng ký hoặc điều lệ. Đọc theo ngữ nghĩa, không chỉ theo từ khóa:
   - "id": slug tiếng Anh không dấu, duy nhất, ổn định.
   - "label": giữ nguyên nội dung câu hỏi bằng tiếng Việt/ngôn ngữ nguồn.
   - "type": chọn đúng một trong TEXT, TEXTAREA, EMAIL, PHONE, NUMBER, SELECT, MULTI_SELECT, CHECKBOX, FILE.
   - EMAIL cho email, PHONE cho số điện thoại; NUMBER cho điểm/trình độ/số lượng; SELECT cho trắc nghiệm một lựa chọn; MULTI_SELECT cho checkbox nhiều lựa chọn; CHECKBOX chỉ cho một ô xác nhận đồng ý; FILE cho tải ảnh/tệp; TEXTAREA cho mô tả dài; TEXT cho họ tên/công ty/địa chỉ ngắn.
   - "required": true nếu câu hỏi có dấu bắt buộc hoặc ngữ nghĩa yêu cầu bắt buộc.
   - "helpText": mô tả/ghi chú đi kèm câu hỏi nếu có.
   - "options": toàn bộ lựa chọn theo đúng thứ tự với SELECT/CHECKBOX.
   - "min", "max": chỉ điền khi nguồn có giới hạn số rõ ràng; "acceptedFileTypes" và "maxFileSizeMb" chỉ điền khi nguồn nêu rõ.
   - "confidence": số từ 0 đến 1 cho độ chắc chắn; "needsReview": true nếu câu hỏi mơ hồ hoặc không chắc loại trường/ràng buộc.
   Không tự thêm các trường hồ sơ hệ thống (họ tên, email, điện thoại) nếu nguồn không hỏi; không bỏ sót câu hỏi đăng ký nào chỉ vì nó không liên quan đến thể thức.

QUAN TRỌNG: Chỉ trả về duy nhất chuỗi JSON hợp lệ theo định dạng yêu cầu. Không bọc trong \`\`\`json\`\`\`, không giải thích thêm.`;

    if (!this.openai) {
      return {
        name: 'Giải Đấu Thể Thao Mới',
        sport: (dto.sportHint as any) || 'pickleball',
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
        registrationFormFields: [],
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
      const rawFields = Array.isArray(parsed.registrationFormFields) ? parsed.registrationFormFields : [];
      const allowedTypes = new Set(['TEXT', 'TEXTAREA', 'EMAIL', 'PHONE', 'NUMBER', 'SELECT', 'MULTI_SELECT', 'CHECKBOX', 'FILE']);
      const usedIds = new Set<string>();
      const registrationFormFields = rawFields
        .map((field: any, index: number) => {
          const baseId = String(field.id || `field_${index + 1}`)
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || `field_${index + 1}`;
          let id = baseId;
          let suffix = 2;
          while (usedIds.has(id)) id = `${baseId}_${suffix++}`;
          usedIds.add(id);
          const options = Array.isArray(field.options)
            ? field.options.map((option: unknown) => String(option).trim()).filter(Boolean).slice(0, 100)
            : undefined;
          const requestedType = allowedTypes.has(field.type) ? field.type : 'TEXT';
          const type = requestedType === 'CHECKBOX' && options && options.length > 1 ? 'MULTI_SELECT' : requestedType;
          return {
            id,
            label: String(field.label || `Câu hỏi ${index + 1}`).trim().slice(0, 300),
            type,
            required: field.required === true,
            helpText: field.helpText ? String(field.helpText).trim().slice(0, 1000) : undefined,
            options: options && options.length > 0 ? options : undefined,
            min: typeof field.min === 'number' && Number.isFinite(field.min) ? field.min : undefined,
            max: typeof field.max === 'number' && Number.isFinite(field.max) ? field.max : undefined,
            acceptedFileTypes: Array.isArray(field.acceptedFileTypes)
              ? field.acceptedFileTypes.map((value: unknown) => String(value).trim()).filter(Boolean).slice(0, 20)
              : undefined,
            maxFileSizeMb: typeof field.maxFileSizeMb === 'number' && Number.isFinite(field.maxFileSizeMb) ? field.maxFileSizeMb : undefined,
            confidence: typeof field.confidence === 'number' ? Math.min(1, Math.max(0, field.confidence)) : undefined,
            needsReview: field.needsReview === true || (typeof field.confidence === 'number' && field.confidence < 0.8),
          };
        })
        .filter((field: { label: string }) => field.label.length > 0)
        .slice(0, 100);

      return {
        name: parsed.name || 'Giải đấu thể thao',
        sport: ['pickleball', 'badminton', 'tennis', 'table_tennis', 'football'].includes(parsed.sport)
          ? parsed.sport
          : (dto.sportHint as any) || 'pickleball',
        startDate: parsed.startDate || null,
        endDate: parsed.endDate || null,
        venueName: parsed.venueName || null,
        locationAddress: parsed.locationAddress || null,
        province: parsed.province || null,
        description: parsed.description || null,
        bannerUrl: parsed.bannerUrl || null,
        formats: Array.isArray(parsed.formats) && parsed.formats.length > 0
          ? parsed.formats.map((f: any) => ({
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
        registrationFormFields,
      };
    } catch (error: any) {
      this.logger.error(`Lỗi phân tích AI Tournament: ${error.message}`);
      throw new InternalServerErrorException(`Không thể phân tích nội dung giải: ${error.message}`);
    }
  }
}
