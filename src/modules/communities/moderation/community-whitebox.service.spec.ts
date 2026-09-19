import { CommunityWhiteboxService } from './community-whitebox.service';

describe('CommunityWhiteboxService (Tier 1 Moderation)', () => {
  let service: CommunityWhiteboxService;

  beforeEach(() => {
    service = new CommunityWhiteboxService();
  });

  describe('Clean content checks', () => {
    it('passes for standard sport post', () => {
      const result = service.checkContent('Sáng mai 8h có ai đánh cầu lông ở sân Kỳ Hòa không, nhóm mình thiếu 1 người!');
      expect(result.passed).toBe(true);
      expect(result.rejected).toBe(false);
      expect(result.flagged).toBe(false);
      expect(result.severity).toBe('CLEAN');
    });

    it('passes for empty content or whitespace', () => {
      const result = service.checkContent('   ');
      expect(result.passed).toBe(true);
      expect(result.rejected).toBe(false);
    });
  });

  describe('Critical violation checks (Instant REJECTED)', () => {
    it('rejects gambling keywords immediately', () => {
      const result = service.checkContent('Vào kubet nhận ngay 500k tài xỉu uy tín nhất');
      expect(result.passed).toBe(false);
      expect(result.rejected).toBe(true);
      expect(result.ruleCode).toBe('WHITEBOX_CRITICAL_GAMBLING');
      expect(result.severity).toBe('CRITICAL');
    });

    it('rejects offensive / abusive language immediately', () => {
      const result = service.checkContent('Thằng trọng tài bắt ngu vl đm');
      expect(result.passed).toBe(false);
      expect(result.rejected).toBe(true);
      expect(result.ruleCode).toBe('WHITEBOX_OFFENSIVE_LANGUAGE');
      expect(result.severity).toBe('CRITICAL');
    });

    it('rejects character spam flood', () => {
      const result = service.checkContent('Sân cầu lông aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
      expect(result.passed).toBe(false);
      expect(result.rejected).toBe(true);
      expect(result.ruleCode).toBe('WHITEBOX_CHAR_FLOOD_SPAM');
      expect(result.severity).toBe('CRITICAL');
    });
  });

  describe('Suspicious / Needs AI review checks', () => {
    it('flags shortened links as NEEDS_REVIEW', () => {
      const result = service.checkContent('Xem chi tiết giải đấu tại bit.ly/giai-dau-clb');
      expect(result.passed).toBe(true);
      expect(result.flagged).toBe(true);
      expect(result.rejected).toBe(false);
      expect(result.ruleCode).toBe('WHITEBOX_SUSPICIOUS_LINK');
      expect(result.severity).toBe('NEEDS_REVIEW');
    });

    it('flags multiple phone numbers as NEEDS_REVIEW', () => {
      const result = service.checkContent('Liên hệ 0912345678 hoặc hotline phụ 0987654321 để đặt sân');
      expect(result.passed).toBe(true);
      expect(result.flagged).toBe(true);
      expect(result.severity).toBe('NEEDS_REVIEW');
    });

    it('flags suspicious financial keywords as NEEDS_REVIEW', () => {
      const result = service.checkContent('Cơ hội đầu tư vốn nhỏ lợi nhuận cao cho anh em');
      expect(result.passed).toBe(true);
      expect(result.flagged).toBe(true);
      expect(result.ruleCode).toBe('WHITEBOX_SUSPICIOUS_KEYWORD');
      expect(result.severity).toBe('NEEDS_REVIEW');
    });
  });
});
