import { CommunityWhiteboxService } from './community-whitebox.service';

describe('CommunityWhiteboxService (Tier 1 Moderation)', () => {
  let service: CommunityWhiteboxService;

  beforeEach(() => {
    service = new CommunityWhiteboxService();
  });

  describe('Clean content checks', () => {
    it('passes for standard sport post without contact payload', () => {
      const result = service.checkContent('Sáng mai 8h có ai đánh cầu lông ở sân Kỳ Hòa không, nhóm mình thiếu 1 người!');
      expect(result.passed).toBe(true);
      expect(result.rejected).toBe(false);
      expect(result.flagged).toBe(false);
      expect(result.severity).toBe('CLEAN');
    });

    it('passes for a sport-seeking post', () => {
      const result = service.checkContent('Tối thứ bảy sân Thống Nhất cần thêm một người đánh pickleball trình độ trung bình.');
      expect(result.passed).toBe(true);
      expect(result.rejected).toBe(false);
      expect(result.flagged).toBe(false);
    });

    it('does not reject ordinary sports emoji', () => {
      const result = service.checkContent('Sân 🏸 cầu lông tối nay còn trống một chỗ.');
      expect(result.passed).toBe(true);
      expect(result.rejected).toBe(false);
      expect(result.flagged).toBe(false);
    });

    it('passes for empty content or whitespace', () => {
      const result = service.checkContent('   ');
      expect(result.passed).toBe(true);
      expect(result.rejected).toBe(false);
    });
  });

  describe('Critical violation checks (Instant REJECTED)', () => {
    it.each([
      'Vào kubet nhận ngay 500k tài xỉu uy tín nhất',
      'Vào kսbet nhận ngay 500k tài xỉu uy tín nhất',
    ])('rejects gambling keywords immediately: %s', (text) => {
      const result = service.checkContent(text);
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

  describe('Forbidden link and contact checks (Instant REJECTED)', () => {
    it('rejects a normal URL and keeps it out of the AI path', () => {
      const result = service.checkContent('Xem chi tiết giải đấu tại bit.ly/giai-dau-clb');
      expect(result.passed).toBe(false);
      expect(result.flagged).toBe(true);
      expect(result.rejected).toBe(true);
      expect(result.ruleCode).toBe('WHITEBOX_LINK_FORBIDDEN');
      expect(result.severity).toBe('CRITICAL');
    });

    it('returns the same result when the same URL is scanned repeatedly', () => {
      const first = service.checkContent('Xem tại example.com/giai');
      const second = service.checkContent('Xem tại example.com/giai');
      expect(first.ruleCode).toBe('WHITEBOX_LINK_FORBIDDEN');
      expect(second.ruleCode).toBe('WHITEBOX_LINK_FORBIDDEN');
    });

    it.each([
      'Liên hệ 0912345678 để đặt sân',
      'Liên hệ +84 912 345 678 để đặt sân',
      'Liên hệ 0 9 1 2 3 4 5 6 7 8 để đặt sân',
      'Liên hệ 0/9/1/2/3/4/5/6/7/8 để đặt sân',
      'Liên hệ 028 1234 5678 để đặt sân',
      'Liên hệ +84 28 1234 5678 để đặt sân',
      'Gọi tổng đài 1900 1234 để đặt sân',
      'Gọi miễn phí 1800-123456 để đặt sân',
      'Liên hệ +1 (202) 555-0123 để đặt sân',
      'Liên hệ 0️⃣9️⃣1️⃣2️⃣3️⃣4️⃣5️⃣6️⃣7️⃣8️⃣ để đặt sân',
      'Liên hệ &#x30;&#x39;&#x31;&#x32;&#x33;&#x34;&#x35;&#x36;&#x37;&#x38; để đặt sân',
    ])('rejects phone number form: %s', (text) => {
      const result = service.checkContent(text);
      expect(result.passed).toBe(false);
      expect(result.rejected).toBe(true);
      expect(result.ruleCode).toBe('WHITEBOX_CONTACT_INFO_FORBIDDEN');
      expect(result.severity).toBe('CRITICAL');
    });

    it.each([
      'Gửi thông tin qua admin@example.com',
      'Gửi thông tin qua admin at example dot com',
      'Gửi thông tin qua admin [at] example.com',
      'Gửi thông tin qua admin a còng example dot com',
      'Telegram: sporto_admin',
      'Zalo sporto_admin',
      'Discord: sporto_team',
      'Instagram @sporto_team',
      'zаlo sporto_admin',
      'z🅰️l🅾️ sporto_admin',
      '🇿🇦🇱🇴 sporto_admin',
      'z🔹a🔹l🔹o sporto_admin',
      'z&#x1F170;l&#x1F17E; sporto_admin',
    ])('rejects direct contact form: %s', (text) => {
      const result = service.checkContent(text);
      expect(result.passed).toBe(false);
      expect(result.rejected).toBe(true);
      expect(result.ruleCode).toBe('WHITEBOX_CONTACT_INFO_FORBIDDEN');
      expect(result.severity).toBe('CRITICAL');
    });

    it.each([
      'w w w dot example dot com slash giai',
      'w·w·w dot example dot com slash giai',
      'h t t p s : / / example[.]com/giai',
      'h t t p s : / / e x a m p l e . c o m/giai',
      'hxxps://example(.)com/giai',
      'h📍t📍t📍p📍s📍:📍/📍/📍example📍.📍com',
      'h 📍 t 📍 t 📍 p 📍 s 📍 : 📍 / 📍 / 📍 example 📍 . 📍 com',
      'h t t p s : / / раураl.com/giai',
      'e x a m p l e . c o m/giai',
      'w w w . e x a m p l e . c o m/giai',
      '%2577%2577%2577%252eexample%252ecom/giai',
      'example&amp;#x2e;com/giai',
      'example。com/giai',
      'example·com/giai',
      'Xem tại example.com/giai',
    ])('rejects obfuscated URL form: %s', (text) => {
      const result = service.checkContent(text);
      expect(result.passed).toBe(false);
      expect(result.rejected).toBe(true);
      expect(result.ruleCode).toBe('WHITEBOX_LINK_FORBIDDEN');
      expect(result.severity).toBe('CRITICAL');
    });

    it('rejects mixed-script domains after Unicode skeleton normalization', () => {
      const result = service.checkContent('Xem example.cоm để nhận ưu đãi');
      expect(result.passed).toBe(false);
      expect(result.flagged).toBe(true);
      expect(result.rejected).toBe(true);
      expect(result.ruleCode).toBe('WHITEBOX_LINK_FORBIDDEN');
      expect(result.severity).toBe('CRITICAL');
    });

    it('routes internationalized domains to AI review', () => {
      const result = service.checkContent('Xem example.कॉम để nhận ưu đãi');
      expect(result.passed).toBe(true);
      expect(result.flagged).toBe(true);
      expect(result.rejected).toBe(false);
      expect(result.ruleCode).toBe('WHITEBOX_UNICODE_DOMAIN_REVIEW');
      expect(result.severity).toBe('NEEDS_REVIEW');
    });

    it('rejects phone numbers written with Arabic-Indic digits', () => {
      const result = service.checkContent('Liên hệ ٠٩١٢٣٤٥٦٧٨ để đặt sân');
      expect(result.passed).toBe(false);
      expect(result.rejected).toBe(true);
      expect(result.ruleCode).toBe('WHITEBOX_CONTACT_INFO_FORBIDDEN');
      expect(result.severity).toBe('CRITICAL');
    });
  });

  describe('Suspicious / Needs AI review checks', () => {
    it('routes an ambiguous contact request to AI review', () => {
      const result = service.checkContent('Ai biết thì inbox mình để trao đổi lịch chơi nhé');
      expect(result.passed).toBe(true);
      expect(result.flagged).toBe(true);
      expect(result.rejected).toBe(false);
      expect(result.ruleCode).toBe('WHITEBOX_SUSPICIOUS_CONTACT_OR_LINK');
      expect(result.severity).toBe('NEEDS_REVIEW');
    });

    it('routes a bare social handle to AI review instead of publishing blindly', () => {
      const result = service.checkContent('@sporto_admin nhắn mình để trao đổi lịch chơi nhé');
      expect(result.passed).toBe(true);
      expect(result.flagged).toBe(true);
      expect(result.rejected).toBe(false);
      expect(result.ruleCode).toBe('WHITEBOX_SUSPICIOUS_CONTACT_OR_LINK');
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
