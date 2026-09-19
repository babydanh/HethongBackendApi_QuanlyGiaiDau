import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

export interface BlackboxAiCheckResult {
  isSafe: boolean;
  riskScore: number; // 0.0 - 1.0
  flaggedCategory: 'SPAM' | 'HARASSMENT' | 'GAMBLING' | 'HATE_SPEECH' | 'OFF_TOPIC' | 'COMMERCIAL' | 'NONE';
  reasonVi?: string;
  reasonEn?: string;
  isFallback?: boolean;
}

@Injectable()
export class CommunityBlackboxAiService {
  private readonly logger = new Logger(CommunityBlackboxAiService.name);
  private openai: OpenAI | null = null;
  private modelName: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('ai.apiKey');
    const baseURL = this.configService.get<string>('ai.baseUrl') || 'https://openrouter.ai/api/v1';
    this.modelName = this.configService.get<string>('ai.modelName') || 'meta-llama/llama-3-8b-instruct:free';

    if (apiKey) {
      this.openai = new OpenAI({
        apiKey,
        baseURL,
        defaultHeaders: {
          'HTTP-Referer': 'https://vndcsport.com',
          'X-Title': 'Sporto Moderation Guard',
        },
      });
    }
  }

  /**
   * Kiểm duyệt ngữ cảnh bằng AI LLM (Lớp 2 - Blackbox)
   * Phân tích ngữ cảnh thể thao, phát hiện lừa đảo trá hình, công kích ngầm
   * Có cơ chế Timeout circuit-breaker (3500ms) để không gây nghẽn bài đăng.
   */
  async evaluatePost(content: string, context?: { authorName?: string; communityName?: string }): Promise<BlackboxAiCheckResult> {
    if (!this.openai || !content.trim()) {
      return {
        isSafe: true,
        riskScore: 0.0,
        flaggedCategory: 'NONE',
        isFallback: true,
      };
    }

    try {
      const promptPromise = this.openai.chat.completions.create({
        model: this.modelName,
        temperature: 0.1,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'community_post_moderation_result',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                isSafe: { type: 'boolean' },
                riskScore: { type: 'number' },
                flaggedCategory: {
                  type: 'string',
                  enum: ['SPAM', 'HARASSMENT', 'GAMBLING', 'HATE_SPEECH', 'OFF_TOPIC', 'COMMERCIAL', 'NONE'],
                },
                reasonVi: { type: 'string' },
                reasonEn: { type: 'string' },
              },
              required: ['isSafe', 'riskScore', 'flaggedCategory', 'reasonVi', 'reasonEn'],
              additionalProperties: false,
            },
          },
        },
        messages: [
          {
            role: 'system',
            content: `Bạn là trợ lý AI kiểm duyệt nội dung của mạng xã hội thể thao SportO (Cầu lông, Pickleball, Tennis, Bóng đá...).
Nhiệm vụ của bạn là đánh giá tính lành mạnh của bài viết do người dùng đăng tải.
Quy tắc kiểm duyệt:
1. Cho phép: Thảo luận thể thao, tìm người chơi giao lưu, hỏi mua/bán vợt/giày/dụng cụ thể thao chính hãng, chia sẻ kết quả trận đấu, giao lưu vui vẻ.
2. Vi phạm (isSafe = false, riskScore >= 0.7):
   - GAMBLING: Lôi kéo cá độ, share kèo tài xỉu, tip bóng đá ăn tiền.
   - SPAM: Quảng cáo dịch vụ ngoài thể thao, đa cấp, tín dụng đen, bot rải link.
   - HARASSMENT / HATE_SPEECH: Lăng mạ, bôi nhọ danh dự vận động viên/thành viên khác, phân biệt vùng miền.
Chỉ trả về định dạng JSON theo đúng schema. Lý do (reasonVi, reasonEn) phải ngắn gọn, súc tích (dưới 100 chữ).`,
          },
          {
            role: 'user',
            content: `Cộng đồng: ${context?.communityName || 'CLB Thể thao'}\nTác giả: ${context?.authorName || 'Thành viên'}\nNội dung cần kiểm duyệt:\n"""${content.slice(0, 2000)}"""`,
          },
        ],
      });

      // Áp dụng timeout 3500ms
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('AI Moderation Timeout (3500ms exceeded)')), 3500),
      );

      const response = await Promise.race([promptPromise, timeoutPromise]);
      const rawJson = response.choices[0]?.message?.content?.trim() || '{}';
      const parsed = JSON.parse(rawJson);

      return {
        isSafe: parsed.isSafe ?? true,
        riskScore: typeof parsed.riskScore === 'number' ? Math.max(0, Math.min(1, parsed.riskScore)) : 0.0,
        flaggedCategory: parsed.flaggedCategory || 'NONE',
        reasonVi: parsed.reasonVi || undefined,
        reasonEn: parsed.reasonEn || undefined,
        isFallback: false,
      };
    } catch (error: any) {
      this.logger.warn(`AI Moderation call fallback: ${error.message}`);
      // Fallback an toàn khi AI quá tải hoặc lỗi kết nối: Cho qua nhưng gắn cờ isFallback
      return {
        isSafe: true,
        riskScore: 0.0,
        flaggedCategory: 'NONE',
        isFallback: true,
      };
    }
  }
}
