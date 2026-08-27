import { Controller, Post, Body, Req, Res, UseGuards, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { AiService } from './ai.service';
import { ParseTournamentSourceDto } from './dto/parse-tournament-source.dto';
import { AiScheduleCommandDto } from './dto/ai-schedule-command.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { Verified } from '../../common/decorators/verified.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../common/constants/enums';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

import type { Request, Response } from 'express';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';

@ApiTags('ai')
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  private getUserFromRequest(request: Request): { id?: string; sub?: string; roles?: string[] } | undefined {
    return (request as Request & { user?: { id?: string; sub?: string; roles?: string[] } }).user;
  }

  private getUserIdFromRequest(request: Request): string | undefined {
    const user = this.getUserFromRequest(request);
    return user?.id || user?.sub || undefined;
  }

  private getUserRolesFromRequest(request: Request): string[] {
    const roles = this.getUserFromRequest(request)?.roles;
    return Array.isArray(roles) ? roles.filter((role): role is string => typeof role === 'string') : [];
  }

  @Public()
  @Post('chat')
  @UseGuards(OptionalJwtAuthGuard, new RateLimitGuard(12, 60000))
  @ApiOperation({ summary: 'Gửi tin nhắn hội thoại và nhận phản hồi từ Trợ lý ảo AI' })
  async chat(
    @Body('messages') messages: any[],
    @Body('currentUrl') currentUrl: string,
    @Body('pageTitle') pageTitle: string,
    @Body('isMobile') isMobile: boolean,
    @Body('searchParams') searchParams: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const userId = req ? this.getUserIdFromRequest(req) : undefined;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Turn off buffering on OpenLiteSpeed/Nginx proxy
    res.setHeader('X-Content-Type-Options', 'nosniff');

    try {
      const stream = this.aiService.getChatResponseStream(messages || [], userId, currentUrl, pageTitle, isMobile, searchParams, this.getUserRolesFromRequest(req));
      for await (const event of stream) {
        if (event.type === 'content' && event.content) {
          res.write(`data: ${JSON.stringify({ content: event.content })}\n\n`);
        } else if (event.type === 'tool') {
          res.write(`data: ${JSON.stringify({ tool: event.event })}\n\n`);
        } else if (event.type === 'ui_blocks') {
          res.write(`data: ${JSON.stringify({ ui_blocks: event.blocks })}\n\n`);
        }
      }
      res.write('data: [DONE]\n\n');
      res.end();
    } catch (error: any) {
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
    }
  }

  @Public()
  @Post('message')
  @UseGuards(OptionalJwtAuthGuard, new RateLimitGuard(30, 60000))
  @ApiOperation({ summary: 'Gửi tin nhắn nhận phản hồi JSON trực tiếp (dành cho Mobile App)' })
  async message(
    @Body('messages') messages: any[],
    @Body('message') singleMessage: string,
    @Body('currentUrl') currentUrl: string,
    @Body('pageTitle') pageTitle: string,
    @Body('isMobile') isMobile: boolean,
    @Body('searchParams') searchParams: string,
    @Req() req: Request,
  ) {
    const userId = req ? this.getUserIdFromRequest(req) : undefined;
    const formattedMessages = Array.isArray(messages) && messages.length > 0
      ? messages
      : singleMessage
      ? [{ role: 'user', content: singleMessage }]
      : [];

    const result = await this.aiService.getChatAssistantResponse(
      formattedMessages,
      userId,
      currentUrl,
      pageTitle,
      isMobile ?? true,
      searchParams,
      this.getUserRolesFromRequest(req),
    );

    return { success: true, reply: result.content, data: result.content, ui_blocks: result.uiBlocks, tool_events: result.toolEvents };
  }

  @Post('tournaments/:tournamentId/schedule-preview')
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN, UserRole.PLAYER)
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tạo preview xếp lịch bằng câu lệnh AI, không ghi dữ liệu' })
  async previewTournamentScheduleWithAi(
    @Param('tournamentId', ParseUUIDPipe) tournamentId: string,
    @Body() dto: AiScheduleCommandDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.aiService.previewScheduleFromCommand(tournamentId, user, dto);
  }

  @Public()
  @Post('parse-tournament-source')
  @UseGuards(new RateLimitGuard(15, 60000))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Phân tích Link Google Form / Điều lệ giải đấu để trích xuất thông tin tự động' })
  async parseTournamentSource(@Body() dto: ParseTournamentSourceDto) {
    const data = await this.aiService.parseTournamentSource(dto);

    return { success: true, data };
  }
}
