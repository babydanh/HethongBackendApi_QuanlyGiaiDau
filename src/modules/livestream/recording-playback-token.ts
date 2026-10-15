import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Token phát từng đoạn bản ghi MP4 và cookie phiên `sporto_rec`.
 *
 * - Dạng chuỗi: `base64url(JSON payload)` + `.` + `base64url(HMAC-SHA256(khoá, phần payload))`.
 * - Khoá = HMAC-SHA256(JWT_ACCESS_SECRET, "recording-playback"); không thêm biến môi trường.
 * - Trường `kind` nằm TRONG phần đã ký: token đoạn không dùng được làm cookie và ngược lại.
 * - Chữ ký được kiểm trước khi đọc JSON, so sánh bằng `timingSafeEqual`.
 * - `exp` là epoch ms; hết hạn khi `nowMs >= exp`.
 */

export const RECORDING_PLAYBACK_TTL_MS = 10 * 60 * 1000;
export const RECORDING_SESSION_COOKIE_NAME = 'sporto_rec';
export const RECORDING_SESSION_COOKIE_PATH = '/api/v1/livestream/recordings';
export const RECORDING_STREAM_PATH = '/api/v1/livestream/recordings/stream';

const KEY_LABEL = 'recording-playback';
const SEGMENT_KIND = 'recording-segment';
const SESSION_KIND = 'recording-session';

export interface RecordingSegmentClaims {
  readonly matchId: string;
  readonly stream: string;
  readonly period: string;
  readonly name: string;
  readonly userId: string;
  readonly exp: number;
}

export interface RecordingSessionClaims {
  readonly userId: string;
  readonly exp: number;
}

export interface RecordingSegmentExpectation {
  readonly matchId?: string;
  readonly userId?: string;
}

export interface RecordingSessionExpectation {
  readonly userId?: string;
}

function computeSignature(secret: string, encodedPayload: string): Buffer {
  if (!secret) throw new Error('Khoá phát bản ghi chưa được cấu hình.');
  const playbackKey = createHmac('sha256', secret).update(KEY_LABEL).digest();
  return createHmac('sha256', playbackKey).update(encodedPayload).digest();
}

function seal(secret: string, payload: Record<string, string | number>): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString(
    'base64url',
  );
  const signature = computeSignature(secret, encodedPayload).toString(
    'base64url',
  );
  return `${encodedPayload}.${signature}`;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Trả payload đã xác thực chữ ký; mọi lỗi định dạng hoặc chữ ký đều trả null. */
function unseal(secret: string, token: unknown): Record<string, unknown> | null {
  if (typeof token !== 'string') return null;

  const separator = token.indexOf('.');
  if (
    separator <= 0 ||
    separator === token.length - 1 ||
    token.indexOf('.', separator + 1) !== -1
  ) {
    return null;
  }

  const encodedPayload = token.slice(0, separator);
  const expected = Buffer.from(
    computeSignature(secret, encodedPayload).toString('base64url'),
    'utf8',
  );
  const supplied = Buffer.from(token.slice(separator + 1), 'utf8');
  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  ) {
    return null;
  }

  try {
    const payload: unknown = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8'),
    );
    return isPlainRecord(payload) ? payload : null;
  } catch {
    return null;
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isExpiry(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

export function signRecordingSegmentToken(
  secret: string,
  claims: RecordingSegmentClaims,
): string {
  return seal(secret, {
    kind: SEGMENT_KIND,
    matchId: claims.matchId,
    stream: claims.stream,
    period: claims.period,
    name: claims.name,
    userId: claims.userId,
    exp: claims.exp,
  });
}

/**
 * Kiểm token đoạn: chữ ký, loại token, hạn và (nếu có) khớp `matchId`/`userId` mong đợi.
 * Trả claims khi hợp lệ, ngược lại null.
 */
export function verifyRecordingSegmentToken(
  secret: string,
  token: unknown,
  nowMs: number,
  expected: RecordingSegmentExpectation = {},
): RecordingSegmentClaims | null {
  const payload = unseal(secret, token);
  if (payload?.kind !== SEGMENT_KIND) return null;

  const { matchId, stream, period, name, userId, exp } = payload;
  if (
    !isNonEmptyString(matchId) ||
    !isNonEmptyString(stream) ||
    !isNonEmptyString(period) ||
    !isNonEmptyString(name) ||
    !isNonEmptyString(userId) ||
    !isExpiry(exp)
  ) {
    return null;
  }
  if (nowMs >= exp) return null;
  if (expected.matchId !== undefined && expected.matchId !== matchId) return null;
  if (expected.userId !== undefined && expected.userId !== userId) return null;

  return { matchId, stream, period, name, userId, exp };
}

export function signRecordingSessionCookie(
  secret: string,
  claims: RecordingSessionClaims,
): string {
  return seal(secret, {
    kind: SESSION_KIND,
    userId: claims.userId,
    exp: claims.exp,
  });
}

/** Kiểm cookie phiên: chữ ký, loại cookie, hạn và (nếu có) khớp `userId` mong đợi. */
export function verifyRecordingSessionCookie(
  secret: string,
  cookie: unknown,
  nowMs: number,
  expected: RecordingSessionExpectation = {},
): RecordingSessionClaims | null {
  const payload = unseal(secret, cookie);
  if (payload?.kind !== SESSION_KIND) return null;

  const { userId, exp } = payload;
  if (!isNonEmptyString(userId) || !isExpiry(exp)) return null;
  if (nowMs >= exp) return null;
  if (expected.userId !== undefined && expected.userId !== userId) return null;

  return { userId, exp };
}

/**
 * Quy tắc cấp nội dung một đoạn: token đoạn hợp lệ, cookie phiên hợp lệ và cùng
 * `userId`. Thiếu cookie, cookie hết hạn/sai, hoặc cookie của người khác → null.
 */
export function verifyRecordingPlayback(
  secret: string,
  input: { readonly token: unknown; readonly cookie: unknown; readonly nowMs: number },
): RecordingSegmentClaims | null {
  const segment = verifyRecordingSegmentToken(secret, input.token, input.nowMs);
  if (!segment) return null;

  const session = verifyRecordingSessionCookie(secret, input.cookie, input.nowMs, {
    userId: segment.userId,
  });
  return session ? segment : null;
}
