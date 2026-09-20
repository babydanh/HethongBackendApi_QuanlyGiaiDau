import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BinaryBitmap,
  DecodeHintType,
  HybridBinarizer,
  MultiFormatReader,
  RGBLuminanceSource,
  BarcodeFormat,
} from '@zxing/library';
import sharp from 'sharp';
import { createWorker, type Worker } from 'tesseract.js';
import { isStoredImageUrl } from '../../../common/helpers/cloudinary.helper';

export type CommunityImageScanStatus = 'CLEAN' | 'NEEDS_REVIEW';

export interface CommunityImageScanResult {
  status: CommunityImageScanStatus;
  extractedText: string;
  qrPayloads: string[];
  scannedUrls: string[];
  unscannedUrls: string[];
  reasonVi?: string;
}

type ImageBuffer = { url: string; buffer: Buffer };

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 40_000_000;
const MAX_IMAGE_SIDE = 10_000;
const MAX_OCR_CHARS = 4_000;
const MAX_SCAN_TIME_MS = 8_000;
const FETCH_TIMEOUT_MS = 2_500;
const OCR_TIMEOUT_MS = 5_000;

/**
 * Deterministic checks for media attached to a community post.
 *
 * This service deliberately only fetches images that came from the configured
 * storage host. The post DTO accepts URLs, but fetching arbitrary URLs here
 * would turn moderation into an SSRF primitive. QR payloads and OCR output are
 * returned to the normal whitebox scanner so links/phones get the same policy
 * as ordinary post text.
 */
@Injectable()
export class CommunityImageModerationService implements OnModuleDestroy {
  private readonly logger = new Logger(CommunityImageModerationService.name);
  private readonly allowedHosts: Set<string>;
  private ocrWorkerPromise: Promise<Worker> | null = null;

  constructor(private readonly configService: ConfigService) {
    const configuredHosts = this.configService
      .get<string>('COMMUNITY_MEDIA_ALLOWED_HOSTS')
      ?.split(',')
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean);
    this.allowedHosts = new Set(configuredHosts?.length ? configuredHosts : ['res.cloudinary.com']);
  }

  async scanMediaUrls(mediaUrls?: string[] | null): Promise<CommunityImageScanResult> {
    const urls = [...new Set((mediaUrls ?? []).map((url) => url.trim()).filter(Boolean))].slice(0, 10);
    if (urls.length === 0) {
      return { status: 'CLEAN', extractedText: '', qrPayloads: [], scannedUrls: [], unscannedUrls: [] };
    }

    const startedAt = Date.now();
    const extractedParts: string[] = [];
    const qrPayloads: string[] = [];
    const scannedUrls: string[] = [];
    const unscannedUrls: string[] = [];

    for (const url of urls) {
      if (Date.now() - startedAt >= MAX_SCAN_TIME_MS || !this.isFetchableImageUrl(url)) {
        unscannedUrls.push(url);
        continue;
      }

      try {
        const image = await this.fetchImage(url);
        const metadata = await sharp(image.buffer).metadata();
        if (!metadata.format || metadata.format === 'svg' || metadata.format === 'pdf') {
          unscannedUrls.push(url);
          continue;
        }
        if (
          !metadata.width ||
          !metadata.height ||
          metadata.width > MAX_IMAGE_SIDE ||
          metadata.height > MAX_IMAGE_SIDE ||
          metadata.width * metadata.height > MAX_IMAGE_PIXELS
        ) {
          unscannedUrls.push(url);
          continue;
        }

        const pixels = await sharp(image.buffer)
          .rotate()
          .resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
          .greyscale()
          .raw()
          .toBuffer({ resolveWithObject: true });
        const qrPayload = this.decodeQr(pixels.data, pixels.info.width, pixels.info.height);
        if (qrPayload) {
          qrPayloads.push(qrPayload);
          extractedParts.push(qrPayload);
        }

        const ocrText = await this.readText(image.buffer);
        if (ocrText) extractedParts.push(ocrText);
        scannedUrls.push(url);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'unknown image moderation error';
        this.logger.warn(`Community image scan skipped ${url}: ${message}`);
        unscannedUrls.push(url);
      }
    }

    const extractedText = extractedParts.join('\n').slice(0, MAX_OCR_CHARS);
    if (unscannedUrls.length > 0) {
      return {
        status: 'NEEDS_REVIEW',
        extractedText,
        qrPayloads,
        scannedUrls,
        unscannedUrls,
        reasonVi: 'Có ảnh chưa kiểm tra được bằng bộ lọc tự động; bài viết cần duyệt thêm.',
      };
    }
    return { status: 'CLEAN', extractedText, qrPayloads, scannedUrls, unscannedUrls };
  }

  async onModuleDestroy() {
    if (this.ocrWorkerPromise) {
      try {
        const worker = await this.ocrWorkerPromise;
        await worker.terminate();
      } catch {
        // OCR is best-effort during shutdown.
      }
      this.ocrWorkerPromise = null;
    }
  }

  private isFetchableImageUrl(rawUrl: string): boolean {
    try {
      const url = new URL(rawUrl);
      return url.protocol === 'https:' && this.allowedHosts.has(url.hostname.toLowerCase()) && isStoredImageUrl(rawUrl);
    } catch {
      return false;
    }
  }

  private async fetchImage(url: string): Promise<ImageBuffer> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(url, { method: 'GET', redirect: 'error', signal: controller.signal });
      if (!response.ok) throw new Error(`image fetch returned HTTP ${response.status}`);
      const contentLength = Number(response.headers.get('content-length') || 0);
      if (contentLength > MAX_IMAGE_BYTES) throw new Error('image exceeds moderation size limit');
      if (!response.body) throw new Error('image response has no body');

      const chunks: Buffer[] = [];
      let total = 0;
      for await (const chunk of response.body) {
        const buffer = Buffer.from(chunk);
        total += buffer.length;
        if (total > MAX_IMAGE_BYTES) throw new Error('image exceeds moderation size limit');
        chunks.push(buffer);
      }
      return { url, buffer: Buffer.concat(chunks, total) };
    } finally {
      clearTimeout(timer);
    }
  }

  private decodeQr(data: Buffer, width: number, height: number): string | null {
    try {
      const source = new RGBLuminanceSource(new Uint8ClampedArray(data), width, height);
      const bitmap = new BinaryBitmap(new HybridBinarizer(source));
      const hints = new Map<DecodeHintType, unknown>();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE, BarcodeFormat.DATA_MATRIX, BarcodeFormat.AZTEC]);
      hints.set(DecodeHintType.TRY_HARDER, true);
      const result = new MultiFormatReader().decode(bitmap, hints);
      return result.getText().trim().slice(0, 2_000) || null;
    } catch {
      return null;
    }
  }

  private async readText(buffer: Buffer): Promise<string> {
    if (this.configService.get<string>('COMMUNITY_IMAGE_OCR_ENABLED') === 'false') return '';

    const worker = await this.getOcrWorker();
    try {
      const recognition = await Promise.race([
        worker.recognize(buffer),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('OCR timeout')), OCR_TIMEOUT_MS)),
      ]);
      return recognition.data.text.trim().slice(0, MAX_OCR_CHARS);
    } catch (error) {
      this.ocrWorkerPromise = null;
      try {
        await worker.terminate();
      } catch {
        // Ignore worker cleanup errors; the scan is fail-closed by the caller.
      }
      throw error;
    }
  }

  private getOcrWorker(): Promise<Worker> {
    if (!this.ocrWorkerPromise) {
      const languages = this.configService.get<string>('COMMUNITY_IMAGE_OCR_LANGS') || 'eng+vie';
      const langPath = this.configService.get<string>('COMMUNITY_IMAGE_OCR_LANG_PATH');
      this.ocrWorkerPromise = createWorker(languages, 1, {
        ...(langPath ? { langPath } : {}),
        logger: () => undefined,
      });
    }
    return this.ocrWorkerPromise;
  }
}
