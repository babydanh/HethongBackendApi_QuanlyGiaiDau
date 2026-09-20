import { createHash } from 'node:crypto';
import type { CreateCommunityPostDto } from './dto/create-community-post.dto';
import { normalizeForModeration } from './moderation/community-content-normalizer';

function normalizeText(value?: string | null): string {
  return normalizeForModeration(value || '')
    .normalize('NFKC')
    .toLocaleLowerCase('vi-VN')
    .replace(/\s+/gu, ' ')
    .trim();
}

function normalizeMediaUrl(value: string): string {
  try {
    const url = new URL(value.trim());
    url.search = '';
    url.hash = '';
    return url.toString().toLowerCase();
  } catch {
    return value.trim().toLowerCase();
  }
}

function normalizeTopic(value?: string | null): string {
  return normalizeText(value).replace(/^#+/u, '').trim();
}

/**
 * Stable, privacy-preserving fingerprint for duplicate-post throttling.
 * Mentions are intentionally excluded: tagging a different member must not
 * make an otherwise identical spam post appear new.
 */
export function buildCommunityPostFingerprint(
  dto: Pick<CreateCommunityPostDto, 'body' | 'mediaUrls' | 'topics' | 'poll'> & { mentions?: unknown },
): string {
  const payload = {
    body: normalizeText(dto.body),
    mediaUrls: [...new Set((dto.mediaUrls ?? []).map(normalizeMediaUrl).filter(Boolean))].sort(),
    topics: [...new Set((dto.topics ?? []).map(normalizeTopic).filter(Boolean))].sort(),
    poll: dto.poll
      ? {
          question: normalizeText(dto.poll.question),
          options: dto.poll.options.map(normalizeText),
          allowMultipleAnswers: Boolean(dto.poll.allowMultipleAnswers),
          allowAddOptions: Boolean(dto.poll.allowAddOptions),
          expiresAt: dto.poll.expiresAt || null,
        }
      : null,
  };

  return createHash('sha256').update(JSON.stringify(payload), 'utf8').digest('hex');
}

export function getCommunityDuplicateWindowMinutes(): number {
  const configuredWindow = Number(process.env.COMMUNITY_DUPLICATE_WINDOW_MINUTES || 1440);
  return Number.isFinite(configuredWindow)
    ? Math.min(10080, Math.max(1, Math.trunc(configuredWindow)))
    : 1440;
}
