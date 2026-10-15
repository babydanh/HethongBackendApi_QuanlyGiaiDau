import { createHmac } from 'crypto';
import {
  RECORDING_PLAYBACK_TTL_MS,
  signRecordingSegmentToken,
  signRecordingSessionCookie,
  verifyRecordingPlayback,
  verifyRecordingSegmentToken,
  verifyRecordingSessionCookie,
  type RecordingSegmentClaims,
} from './recording-playback-token';

const SECRET = 'test-access-secret';
const NOW = Date.parse('2026-10-15T23:12:00+07:00');
const EXP = NOW + RECORDING_PLAYBACK_TTL_MS;

const segment: RecordingSegmentClaims = {
  matchId: 'match-1',
  stream: 'camera-stream',
  period: '2026-10-15',
  name: '2026-10-15-23-02-30-0.mp4',
  userId: 'btc-1',
  exp: EXP,
};

/** Đổi phần payload nhưng giữ nguyên chữ ký cũ: mô phỏng việc sửa token. */
function tamperPayload(
  value: string,
  change: Record<string, unknown>,
): string {
  const [encoded, signature] = value.split('.');
  const payload = JSON.parse(
    Buffer.from(encoded, 'base64url').toString('utf8'),
  ) as Record<string, unknown>;
  const forged = Buffer.from(
    JSON.stringify({ ...payload, ...change }),
    'utf8',
  ).toString('base64url');
  return `${forged}.${signature}`;
}

describe('recording segment token', () => {
  const token = signRecordingSegmentToken(SECRET, segment);

  it('verifies a fresh token and returns its claims', () => {
    expect(verifyRecordingSegmentToken(SECRET, token, NOW)).toEqual(segment);
  });

  it('accepts one millisecond before expiry and rejects from the expiry instant on', () => {
    expect(verifyRecordingSegmentToken(SECRET, token, EXP - 1)).toEqual(segment);
    expect(verifyRecordingSegmentToken(SECRET, token, EXP)).toBeNull();
    expect(verifyRecordingSegmentToken(SECRET, token, EXP + 60_000)).toBeNull();
  });

  it('rejects a payload edited while keeping the original signature', () => {
    expect(
      verifyRecordingSegmentToken(
        SECRET,
        tamperPayload(token, { name: '2026-10-15-23-11-02-0.mp4' }),
        NOW,
      ),
    ).toBeNull();
    expect(
      verifyRecordingSegmentToken(
        SECRET,
        tamperPayload(token, { exp: EXP + 3_600_000 }),
        NOW,
      ),
    ).toBeNull();
  });

  it('rejects a changed signature and a token signed with another secret', () => {
    const [encoded, signature] = token.split('.');
    const flipped = signature.startsWith('A')
      ? `B${signature.slice(1)}`
      : `A${signature.slice(1)}`;

    expect(
      verifyRecordingSegmentToken(SECRET, `${encoded}.${flipped}`, NOW),
    ).toBeNull();
    expect(
      verifyRecordingSegmentToken('another-secret', token, NOW),
    ).toBeNull();
  });

  it('rejects a token signed with the raw secret instead of the derived playback key', () => {
    const encoded = Buffer.from(
      JSON.stringify({ kind: 'recording-segment', ...segment }),
      'utf8',
    ).toString('base64url');
    const signedWithRawSecret = createHmac('sha256', SECRET)
      .update(encoded)
      .digest('base64url');

    expect(
      verifyRecordingSegmentToken(
        SECRET,
        `${encoded}.${signedWithRawSecret}`,
        NOW,
      ),
    ).toBeNull();
  });

  it('rejects a token for another match when the caller expects a specific match', () => {
    expect(
      verifyRecordingSegmentToken(SECRET, token, NOW, { matchId: 'match-1' }),
    ).toEqual(segment);
    expect(
      verifyRecordingSegmentToken(SECRET, token, NOW, { matchId: 'match-2' }),
    ).toBeNull();
  });

  it.each([
    undefined,
    null,
    42,
    '',
    'no-dot-here',
    '.signature-only',
    'payload-only.',
    `${token}.extra`,
    token.slice(0, -4),
  ])('rejects malformed token value %p', (malformed) => {
    expect(verifyRecordingSegmentToken(SECRET, malformed, NOW)).toBeNull();
  });

  it('refuses to sign or verify without a secret', () => {
    expect(() => signRecordingSegmentToken('', segment)).toThrow();
    expect(() => verifyRecordingSegmentToken('', token, NOW)).toThrow();
  });
});

describe('recording session cookie', () => {
  const cookie = signRecordingSessionCookie(SECRET, {
    userId: 'btc-1',
    exp: EXP,
  });

  it('verifies for the same user before expiry', () => {
    expect(
      verifyRecordingSessionCookie(SECRET, cookie, NOW, { userId: 'btc-1' }),
    ).toEqual({ userId: 'btc-1', exp: EXP });
  });

  it('rejects an expired cookie', () => {
    expect(verifyRecordingSessionCookie(SECRET, cookie, EXP)).toBeNull();
  });

  it('rejects a tampered cookie that claims another user', () => {
    expect(
      verifyRecordingSessionCookie(
        SECRET,
        tamperPayload(cookie, { userId: 'referee-9' }),
        NOW,
      ),
    ).toBeNull();
  });

  it('rejects a cookie that belongs to another user', () => {
    expect(
      verifyRecordingSessionCookie(SECRET, cookie, NOW, {
        userId: 'referee-9',
      }),
    ).toBeNull();
  });

  it.each([undefined, null, ''])('rejects a missing cookie (%p)', (missing) => {
    expect(verifyRecordingSessionCookie(SECRET, missing, NOW)).toBeNull();
  });

  it('does not accept a segment token presented as the session cookie', () => {
    const token = signRecordingSegmentToken(SECRET, segment);
    expect(verifyRecordingSessionCookie(SECRET, token, NOW)).toBeNull();
  });
});

describe('recording playback gate (segment token + session cookie)', () => {
  const token = signRecordingSegmentToken(SECRET, segment);
  const cookie = signRecordingSessionCookie(SECRET, {
    userId: 'btc-1',
    exp: EXP,
  });

  it('grants the segment when the token and the owner cookie are both valid', () => {
    expect(
      verifyRecordingPlayback(SECRET, { token, cookie, nowMs: NOW }),
    ).toEqual(segment);
  });

  it('denies when the cookie is missing (URL copied to another browser)', () => {
    expect(
      verifyRecordingPlayback(SECRET, { token, cookie: undefined, nowMs: NOW }),
    ).toBeNull();
  });

  it('denies when the cookie belongs to another user', () => {
    const otherUserCookie = signRecordingSessionCookie(SECRET, {
      userId: 'referee-9',
      exp: EXP,
    });
    expect(
      verifyRecordingPlayback(SECRET, {
        token,
        cookie: otherUserCookie,
        nowMs: NOW,
      }),
    ).toBeNull();
  });

  it('denies an expired token even with a valid cookie', () => {
    expect(
      verifyRecordingPlayback(SECRET, { token, cookie, nowMs: EXP }),
    ).toBeNull();
  });

  it('denies an expired cookie even with a valid token', () => {
    const staleCookie = signRecordingSessionCookie(SECRET, {
      userId: 'btc-1',
      exp: NOW - 1,
    });
    expect(
      verifyRecordingPlayback(SECRET, {
        token,
        cookie: staleCookie,
        nowMs: NOW,
      }),
    ).toBeNull();
  });
});
