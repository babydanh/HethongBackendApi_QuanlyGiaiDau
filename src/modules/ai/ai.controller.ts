import { Controller, Post, Body, Req, Res, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { AiService } from './ai.service';
import type { Request, Response } from 'express';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';

@ApiTags('ai')
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  private getUserIdFromRequest(request: Request): string | undefined {
    if (!request || !request.headers) return undefined;
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return undefined;
    }
    const token = authHeader.split(' ')[1];
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('ascii'));
      return payload.sub || undefined;
    } catch {
      return undefined;
    }
  }

  @Public()
  @Post('chat')
  @UseGuards(new RateLimitGuard(12, 60000))
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
      const stream = await this.aiService.getChatResponseStream(messages || [], userId, currentUrl, pageTitle, isMobile, searchParams);
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          res.write(`data: ${JSON.stringify({ content })}\n\n`);
        }
      }
      res.write('data: [DONE]\n\n');
      res.end();
    } catch (error: any) {
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
    }
  }
}
