import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response as ExpressResponse } from 'express';
import { Readable } from 'node:stream';

/**
 * Proxy luồng media để web (HTTPS) xem được nguồn `http://` của media server ở sân.
 *
 * Vì sao cần: trang live phục vụ qua HTTPS, trình duyệt chặn mixed content nên video
 * `http://` không bao giờ hiện. Khách gọi endpoint này qua HTTPS, backend gọi nguồn
 * `http://` rồi chuyển tiếp — trình duyệt chỉ thấy HTTPS.
 *
 * Bảo mật: chỉ host trong `LIVESTREAM_PROXY_ALLOWED_HOSTS` được phép. Không có
 * allowlist thì endpoint trả 403 thay vì mở, vì một proxy mở là SSRF vào mạng nội
 * bộ (metadata service, DB, admin panel nội bộ).
 */
@Injectable()
export class LivestreamProxyService {
  private readonly logger = new Logger(LivestreamProxyService.name);
  /** Đường dẫn được phép; chặn ../ và URL không parse được. */
  private static readonly PATH_PATTERN = /^\/live\/[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/;

  constructor(private readonly configService: ConfigService) {}

  private allowedHosts(): string[] {
    return (this.configService.get<string>('LIVESTREAM_PROXY_ALLOWED_HOSTS') ?? '')
      .split(',')
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean);
  }

  private resolveUpstream(host: string, streamPath: string) {
    const allowed = this.allowedHosts();
    if (allowed.length === 0) {
      throw new ForbiddenException('Proxy livestream chưa được bật.');
    }
    if (!allowed.includes(host.toLowerCase())) {
      throw new ForbiddenException('Host này không nằm trong danh sách được phép proxy.');
    }
    if (!LivestreamProxyService.PATH_PATTERN.test(streamPath)) {
      throw new BadRequestException('Đường dẫn luồng không hợp lệ.');
    }
    return `http://${host}${streamPath}`;
  }

  async proxyStream(req: Request, res: ExpressResponse, rawUrl: string | undefined) {
    if (!rawUrl) {
      throw new BadRequestException('Thiếu tham số url.');
    }

    let target: URL;
    try {
      target = new URL(rawUrl);
    } catch {
      throw new BadRequestException('URL luồng không hợp lệ.');
    }
    if (target.protocol !== 'http:') {
      // Đã là HTTPS thì không cần proxy; client tự dùng luồng gốc.
      throw new BadRequestException('Chỉ proxy nguồn http://; nguồn https:// dùng trực tiếp.');
    }

    const upstream = this.resolveUpstream(target.hostname, target.pathname);
    this.logger.log(`Proxying livestream from ${upstream}`);

    const controller = new AbortController();
    // Khách đóng tab là request bị hủy; phải hủy luôn request lên sân nếu không
    // thì upstream giữ connection mở và tốn băng thông hai đầu.
    req.on('close', () => controller.abort());

    let upstreamRes: Response;
    try {
      upstreamRes = await fetch(upstream, {
        headers: { 'User-Agent': 'SportO-Livestream-Proxy' },
        signal: controller.signal,
      });
    } catch (err) {
      this.logger.error(`Khong lay duoc ${upstream}: ${(err as Error).message}`);
      throw new NotFoundException('Không lấy được luồng phát từ media server.');
    }

    if (!upstreamRes.ok || !upstreamRes.body) {
      this.logger.warn(`Upstream ${upstream} tra ve ${upstreamRes.status}`);
      res.status(upstreamRes.status === 404 ? 404 : 502);
      res.end();
      return;
    }

    // Stream trực tiếp, không buffer toàn bộ: luồng FLV dài hạn, buffer sẽ ngốn RAM.
    res.status(200);
    res.setHeader('Content-Type', upstreamRes.headers.get('content-type') ?? 'video/x-flv');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const upstreamStream = Readable.fromWeb(
      upstreamRes.body as Parameters<typeof Readable.fromWeb>[0],
    );
    upstreamStream.on('error', (err) => {
      this.logger.warn(`Upstream stream loi: ${err.message}`);
      res.end();
    });
    upstreamStream.pipe(res);
  }
}
