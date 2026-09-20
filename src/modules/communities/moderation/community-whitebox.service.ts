import { Injectable } from '@nestjs/common';
import {
  analyzeForModeration,
  findModerationMatches,
} from './community-content-normalizer';

export interface WhiteboxCheckResult {
  passed: boolean;
  flagged: boolean;
  rejected: boolean;
  ruleCode?: string;
  reasonVi?: string;
  reasonEn?: string;
  severity: 'CLEAN' | 'NEEDS_REVIEW' | 'CRITICAL';
}

const URL_PATTERN = /(?:https?:\/\/|www\.)[^\s<>"']+|\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}(?::\d{2,5})?(?:[/?#][^\s<>"']*)?/i;
const IP_URL_PATTERN = /\b(?:\d{1,3}\.){3}\d{1,3}(?::\d{2,5})?(?:[/?#][^\s<>"']*)?/i;
// Non-ASCII domain labels can be legitimate names, so route them through AI
// after whitebox checks instead of rejecting every internationalized word.
const UNICODE_DOMAIN_PATTERN = /(?<![\p{L}\p{N}\p{M}])(?=[\p{L}\p{N}.-]*[\u0080-\u{10ffff}])(?:[\p{L}\p{N}][\p{L}\p{N}\p{M}-]{0,62}\.)+[\p{L}\p{N}][\p{L}\p{N}\p{M}-]{1,62}(?![\p{L}\p{N}\p{M}])/iu;
const PHONE_PATTERN = /(?<!\d)(?:\+?84|0)[\s().,_/|•·-]*(?:2(?:\d[\s().,_/|•·-]*){9}|(?:3[2-9]|5[689]|7[06-9]|8[1-9]|9\d)(?:[\s().,_/|•·-]*\d){7})(?!\d)/i;
const SERVICE_PHONE_PATTERN = /(?<!\d)(?:1800|1900)[\s().,_/|•·-]*\d{4,8}(?!\d)/i;
const INTERNATIONAL_PHONE_PATTERN = /(?<!\d)\+\d{1,3}[\s().,_/|•·-]*(?:\d[\s().,_/|•·-]*){7,14}(?!\d)/i;
const EMAIL_PATTERN = /\b[a-z0-9.!#$%&'*+/=?^_`{|}~-]+\s*@\s*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+\b/i;
const EMAIL_ALIAS_PATTERN = /\b[a-z0-9.!#$%&'*+/=?^_`{|}~-]+\s+(?:at|a\s*còng|a\s*cong)\s+[a-z0-9.-]+\.[a-z]{2,}\b/i;
const DIRECT_HANDLE_PATTERN = /\b(?:z\s*a\s*l\s*o|t\s*e\s*l\s*e\s*g\s*r\s*a\s*m|whatsapp|messenger|signal|viber|facebook|instagram|discord|kakaotalk|line)\s*(?:[:@]|\s+)[a-z0-9_.-]{3,}\b/i;
const CONTACT_INTENT_PATTERN = /\b(?:z\s*a\s*l\s*o|t\s*e\s*l\s*e\s*g\s*r\s*a\s*m|whatsapp|messenger|signal|viber|facebook|instagram|discord|kakaotalk|line|hotline|inbox|liên\s*hệ|lien\s*he|ib|sđt|sdt|phone)\b/i;
const BARE_HANDLE_PATTERN = /(?<![\w@])@[a-z0-9][a-z0-9_.-]{2,}\b/i;
const OBFUSCATION_PATTERN = /(?:w\s*[._-]?\s*w\s*[._-]?\s*w|h\s*(?:t\s*){2}p|h\s*x\s*x\s*p|\[[.:/@]\]|\([.:/@]\)|\{[.:/@]\})/i;

@Injectable()
export class CommunityWhiteboxService {
  private readonly criticalKeywords: RegExp[] = [
    /\b(cá\s*độ|đánh\s*bạc|lô\s*đề|tài\s*xỉu|baccarat|xóc\s*đĩa|ku\s*bet|kubet|thabet|sunwin|go88|hitclub|789bet|new88|jun88|shbet|hi88|fb88|w88|m88|fun88|bk8|kèo\s*nhà\s*cái|bao\s*nổ\s*hũ)\b/i,
    /\b(cho\s*vay\s*nặng\s*lãi|tín\s*dụng\s*đen|bốc\s*bát\s*họ|rút\s*tiền\s*thẻ\s*tín\s*dụng\s*đáo\s*hạn)\b/i,
  ];

  private readonly offensiveKeywords: RegExp[] = [
    /(?:^|\s|[.,!?;])(đ[ụịịt]\s*m[ẹẹ]|d[uụ]\s*m[aá]|đ[cụ]\s*m|v[lck]l|đ[eé]o|l[ồo]\s*n|c[ặa]\s*c|b[ừu]\s*ồi|đm)(?:$|\s|[.,!?;])/i,
    /\b(fuck|bitch|asshole|motherfucker)\b/i,
  ];

  private readonly suspiciousKeywords: RegExp[] = [
    /\b(kèo|tip\s*kèo|kèo\s*thơm|ib\s*kèo|vốn\s*nhỏ|lợi\s*nhuận\s*cao|hoa\s*hồng\s*khủng)\b/i,
    /\b(làm\s*giàu|kiếm\s*tiền|quảng\s*cáo|bán\s*hàng|tuyển\s*cộng\s*tác\s*viên)\b/i,
  ];

  /** Return the same canonical text that deterministic checks inspect. */
  getNormalizedText(content?: string | null): string {
    return analyzeForModeration((content || '').trim()).normalized;
  }

  checkContent(content?: string | null): WhiteboxCheckResult {
    const text = (content || '').trim();
    if (!text) {
      return { passed: true, flagged: false, rejected: false, severity: 'CLEAN' };
    }

    const unicodeScan = analyzeForModeration(text);
    const scanText = unicodeScan.normalized;

    for (const pattern of this.criticalKeywords) {
      if (pattern.test(scanText)) {
        return this.reject(
          'WHITEBOX_CRITICAL_GAMBLING',
          'Nội dung chứa từ khóa liên quan đến cá cược, cờ bạc hoặc dịch vụ tài chính vi phạm quy định.',
          'Content contains prohibited gambling or unauthorized financial keywords.',
        );
      }
    }

    for (const pattern of this.offensiveKeywords) {
      if (pattern.test(scanText)) {
        return this.reject(
          'WHITEBOX_OFFENSIVE_LANGUAGE',
          'Nội dung chứa ngôn từ khiếm nhã, thô tục hoặc công kích cá nhân.',
          'Content contains offensive or abusive language.',
        );
      }
    }

    if (this.isCharacterSpam(scanText)) {
      return this.reject(
        'WHITEBOX_CHAR_FLOOD_SPAM',
        'Nội dung lặp ký tự liên tục gây nhiễu bảng tin.',
        'Content detected as character spam flood.',
      );
    }

    const contactScanText = scanText
      .replace(
        /\b([a-z0-9._%+-]+)\s*(?:\[|\(|\{|<)\s*(?:at|a\s*còng|a\s*cong)\s*(?:\]|\)|\}|>)\s*([a-z0-9.-]+\.[a-z]{2,})\b/gi,
        '$1@$2',
      )
      .replace(
        /\b([a-z0-9._%+-]+)\s+(?:at|a\s*còng|a\s*cong)\s+([a-z0-9.-]+\.[a-z]{2,})\b/gi,
        '$1@$2',
      );
    const phoneScanText = contactScanText.replace(/(?<=\d)[\s().,_/|•·-]+(?=\d)/g, '');
    if (
      findModerationMatches(phoneScanText, PHONE_PATTERN).length > 0 ||
      findModerationMatches(phoneScanText, SERVICE_PHONE_PATTERN).length > 0 ||
      findModerationMatches(phoneScanText, INTERNATIONAL_PHONE_PATTERN).length > 0 ||
      findModerationMatches(contactScanText, EMAIL_PATTERN).length > 0 ||
      findModerationMatches(contactScanText, EMAIL_ALIAS_PATTERN).length > 0 ||
      findModerationMatches(contactScanText, DIRECT_HANDLE_PATTERN).length > 0
    ) {
      return this.reject(
        'WHITEBOX_CONTACT_INFO_FORBIDDEN',
        'Bài viết không được chứa số điện thoại, email hoặc thông tin liên hệ trực tiếp.',
        'Posts may not contain phone numbers, email addresses, or direct contact handles.',
      );
    }

    const urlMatches = [
      ...findModerationMatches(scanText, URL_PATTERN),
      ...findModerationMatches(scanText, IP_URL_PATTERN),
    ];
    if (urlMatches.length > 0) {
      return this.reject(
        'WHITEBOX_LINK_FORBIDDEN',
        'Bài viết không được chứa đường dẫn hoặc liên kết mời.',
        'Posts may not contain external URLs or invite links.',
      );
    }

    if (unicodeScan.spoofed) {
      return this.review(
        'WHITEBOX_UNICODE_SPOOF_REVIEW',
        'Nội dung có ký tự Unicode giả dạng, ẩn hoặc trộn bảng chữ cái, cần kiểm tra thêm.',
        'Content contains confusable, invisible or mixed-script Unicode and needs review.',
      );
    }

    if (UNICODE_DOMAIN_PATTERN.test(scanText)) {
      return this.review(
        'WHITEBOX_UNICODE_DOMAIN_REVIEW',
        'Nội dung có tên miền dùng ký tự Unicode, cần kiểm tra thêm để tránh liên kết giả mạo.',
        'Content contains an internationalized or mixed-script domain and needs review for spoofed links.',
      );
    }

    if (OBFUSCATION_PATTERN.test(text) || CONTACT_INTENT_PATTERN.test(scanText) || BARE_HANDLE_PATTERN.test(scanText)) {
      return this.review(
        'WHITEBOX_SUSPICIOUS_CONTACT_OR_LINK',
        'Nội dung có dấu hiệu né bộ lọc hoặc kêu gọi liên hệ, cần kiểm tra thêm.',
        'Content contains possible filter evasion or contact solicitation and needs review.',
      );
    }

    for (const pattern of this.suspiciousKeywords) {
      if (pattern.test(scanText)) {
        return this.review(
          'WHITEBOX_SUSPICIOUS_KEYWORD',
          'Nội dung chứa từ khóa cần xác minh ngữ cảnh bằng AI.',
          'Content contains context-sensitive keywords requiring AI verification.',
        );
      }
    }

    return { passed: true, flagged: false, rejected: false, severity: 'CLEAN' };
  }

  private reject(ruleCode: string, reasonVi: string, reasonEn: string): WhiteboxCheckResult {
    return {
      passed: false,
      flagged: true,
      rejected: true,
      ruleCode,
      reasonVi,
      reasonEn,
      severity: 'CRITICAL',
    };
  }

  private review(ruleCode: string, reasonVi: string, reasonEn: string): WhiteboxCheckResult {
    return {
      passed: true,
      flagged: true,
      rejected: false,
      ruleCode,
      reasonVi,
      reasonEn,
      severity: 'NEEDS_REVIEW',
    };
  }

  private isCharacterSpam(text: string): boolean {
    if (text.length < 20) return false;
    return /(.)\1{7,}/u.test(text);
  }
}
