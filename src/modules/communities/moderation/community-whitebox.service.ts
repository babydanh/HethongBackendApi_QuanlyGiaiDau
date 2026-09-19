import { Injectable, Logger } from '@nestjs/common';

export interface WhiteboxCheckResult {
  passed: boolean;
  flagged: boolean;
  rejected: boolean;
  ruleCode?: string;
  reasonVi?: string;
  reasonEn?: string;
  severity: 'CLEAN' | 'NEEDS_REVIEW' | 'CRITICAL';
}

@Injectable()
export class CommunityWhiteboxService {
  private readonly logger = new Logger(CommunityWhiteboxService.name);

  // Blacklist cờ bạc, cá độ, lừa đảo nghiêm trọng (Critical Violation -> REJECTED tức thời)
  private readonly criticalKeywords: RegExp[] = [
    /\b(cá\s*độ|đánh\s*bạc|lô\s*đề|tài\s*xỉu|baccarat|xóc\s*đĩa|ku\s*bet|kubet|thabet|sunwin|go88|hitclub|789bet|new88|jun88|shbet|hi88|fb88|w88|m88|fun88|bk8|kèo\s*nhà\s*cái|bao\s*nổ\s*hũ)\b/i,
    /\b(cho\s*vay\s*nặng\s*lãi|tín\s*dụng\s*đen|bốc\s*bát\s*họ|rút\s*tiền\s*thẻ\s*tín\s*dụng\s*đáo\s*hạn)\b/i,
  ];

  // Blacklist từ ngữ thô tục, xúc phạm nặng
  private readonly offensiveKeywords: RegExp[] = [
    /(?:^|\s|[.,!?;])(đ[ụịịt]\s*m[ẹẹ]|d[uụ]\s*m[aá]|đ[cụ]\s*m|v[lck]l|đ[eé]o|l[ồo]\s*n|c[ặa]\s*c|b[ừu]\s*ồi|đm)(?:$|\s|[.,!?;])/i,
    /\b(fuck|bitch|asshole|motherfucker)\b/i,
  ];

  // Từ khóa nghi vấn cần đưa vào Blackbox AI kiểm tra kỹ (NEEDS_REVIEW)
  private readonly suspiciousKeywords: RegExp[] = [
    /\b(kèo|tip\s*kèo|kèo\s*thơm|ib\s*kèo|vốn\s*nhỏ|lợi\s*nhuận\s*cao|hoa\s*hồng\s*khủng)\b/i,
    /\b(telegram|zalo|hotline|liên\s*hệ\s*ngay|inbox\s*kín)\b/i,
  ];

  // Regex phát hiện số điện thoại lạ rải rác spam (ví dụ: 09xx xxx xxx hoặc 03xx.xxx.xxx)
  private readonly phoneRegex = /(?:\+84|0)(?:3[2-9]|5[689]|7[06-9]|8[1-9]|9\d)[\s.-]?\d{3}[\s.-]?\d{3,4}\b/g;

  // Domain đáng ngờ / rút gọn link
  private readonly suspiciousLinkRegex = /(https?:\/\/)?(bit\.ly|tinyurl\.com|t\.me|zalo\.me\/g\/|shorturl\.at|cutt\.ly)\/[a-zA-Z0-9_\-]+/gi;

  /**
   * Kiểm tra nhanh nội dung bài viết ở Lớp 1 (Whitebox)
   * @param content Nội dung văn bản của bài viết hoặc poll
   */
  checkContent(content?: string | null): WhiteboxCheckResult {
    const text = (content || '').trim();
    if (!text) {
      return { passed: true, flagged: false, rejected: false, severity: 'CLEAN' };
    }

    // 1. Kiểm tra từ khóa cờ bạc / vi phạm pháp luật nghiêm trọng
    for (const pattern of this.criticalKeywords) {
      if (pattern.test(text)) {
        return {
          passed: false,
          flagged: true,
          rejected: true,
          ruleCode: 'WHITEBOX_CRITICAL_GAMBLING',
          reasonVi: 'Nội dung chứa từ khóa liên quan đến cá cược, cờ bạc hoặc dịch vụ tài chính vi phạm quy định.',
          reasonEn: 'Content contains prohibited gambling or unauthorized financial keywords.',
          severity: 'CRITICAL',
        };
      }
    }

    // 2. Kiểm tra từ ngữ thô tục, xúc phạm
    for (const pattern of this.offensiveKeywords) {
      if (pattern.test(text)) {
        return {
          passed: false,
          flagged: true,
          rejected: true,
          ruleCode: 'WHITEBOX_OFFENSIVE_LANGUAGE',
          reasonVi: 'Nội dung chứa ngôn từ khiếm nhã, thô tục hoặc công kích cá nhân.',
          reasonEn: 'Content contains offensive or abusive language.',
          severity: 'CRITICAL',
        };
      }
    }

    // 3. Kiểm tra Heuristic: Ký tự lặp lại bất thường (Spam flood, entropy cực thấp)
    if (this.isCharacterSpam(text)) {
      return {
        passed: false,
        flagged: true,
        rejected: true,
        ruleCode: 'WHITEBOX_CHAR_FLOOD_SPAM',
        reasonVi: 'Nội dung lặp ký tự liên tục gây nhiễu bảng tin.',
        reasonEn: 'Content detected as character spam flood.',
        severity: 'CRITICAL',
      };
    }

    // 4. Kiểm tra Link rút gọn / link nghi vấn
    if (this.suspiciousLinkRegex.test(text)) {
      return {
        passed: true,
        flagged: true,
        rejected: false,
        ruleCode: 'WHITEBOX_SUSPICIOUS_LINK',
        reasonVi: 'Nội dung chứa liên kết rút gọn hoặc nhóm ngoài cần qua AI kiểm duyệt.',
        reasonEn: 'Content contains shortened or external invite links requiring AI review.',
        severity: 'NEEDS_REVIEW',
      };
    }

    // 5. Kiểm tra rải số điện thoại kèm từ khóa nghi vấn (quảng cáo/lôi kéo)
    const matchedPhones = text.match(this.phoneRegex);
    if (matchedPhones && matchedPhones.length >= 2) {
      return {
        passed: true,
        flagged: true,
        rejected: false,
        ruleCode: 'WHITEBOX_PHONE_BURST',
        reasonVi: 'Nội dung xuất hiện nhiều số điện thoại liên tiếp.',
        reasonEn: 'Content contains multiple phone numbers.',
        severity: 'NEEDS_REVIEW',
      };
    }

    // 6. Kiểm tra từ khóa nghi vấn
    for (const pattern of this.suspiciousKeywords) {
      if (pattern.test(text)) {
        return {
          passed: true,
          flagged: true,
          rejected: false,
          ruleCode: 'WHITEBOX_SUSPICIOUS_KEYWORD',
          reasonVi: 'Nội dung chứa từ khóa cần xác minh ngữ cảnh bằng AI.',
          reasonEn: 'Content contains context-sensitive keywords requiring AI verification.',
          severity: 'NEEDS_REVIEW',
        };
      }
    }

    return {
      passed: true,
      flagged: false,
      rejected: false,
      severity: 'CLEAN',
    };
  }

  /**
   * Phát hiện spam lặp ký tự (vd: "aaaaaaaaaaa" hoặc "!?!?!?!!?!?")
   */
  private isCharacterSpam(text: string): boolean {
    if (text.length < 20) return false;
    // Tìm chuỗi có cùng 1 ký tự lặp lại từ 8 lần trở lên
    const repetitionRegex = /(.)\1{7,}/;
    return repetitionRegex.test(text);
  }
}
