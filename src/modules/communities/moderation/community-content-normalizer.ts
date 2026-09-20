import { analyze } from '@moderation-api/unicode-spoofing';

const ZERO_WIDTH_PATTERN = /[\u200B-\u200D\uFEFF\u2060]/g;
const EMOJI_MODIFIER_PATTERN = /[\uFE0E\uFE0F\u20E3]/g;
const UNICODE_DOT_PATTERN = /[\u3002\uFF0E\uFF61]/g;
const DEFANGED_DOT_PATTERN = /(?<=[a-z0-9])[\u00B7\u2022\u2024\u2027\u2219\u22C5](?=[a-z0-9])/giu;

const EMOJI_LETTER_REPLACEMENTS: Record<number, string> = {
  0x1f170: 'a', // 🅰
  0x1f171: 'b', // 🅱
  0x1f17e: 'o', // 🅾
  0x1f17f: 'p', // 🅿
};

const normalizeRegionalIndicators = (value: string): string => value.replace(/[\u{1F1E6}-\u{1F1FF}]/gu, (character) => {
  const codePoint = character.codePointAt(0);
  return codePoint === undefined ? character : String.fromCharCode(65 + codePoint - 0x1f1e6);
});

const normalizeEmojiLetters = (value: string): string => value.replace(/[\u{1F170}\u{1F171}\u{1F17E}\u{1F17F}]/gu, (character) => {
  const codePoint = character.codePointAt(0);
  return codePoint === undefined ? character : EMOJI_LETTER_REPLACEMENTS[codePoint] ?? character;
});

const removeInterspersedPictographs = (value: string): string => value.replace(
  /(?<=[a-z0-9])\s*[\p{Extended_Pictographic}]+\s*(?=[a-z0-9])/giu,
  '',
).replace(
  /(?<=[a-z0-9/:.?@_-])\s*[\p{Extended_Pictographic}]+\s*(?=[a-z0-9/:.?@_-])/giu,
  '',
);

// Normalize the most common non-ASCII decimal digit blocks used to split or
// disguise phone numbers. NFKC already handles full-width digits, while these
// blocks need an explicit scan-only mapping.
const DECIMAL_DIGIT_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x0660, 0x0669], // Arabic-Indic
  [0x06f0, 0x06f9], // Eastern Arabic-Indic
  [0x0966, 0x096f], // Devanagari
  [0x09e6, 0x09ef], // Bengali
  [0x0e50, 0x0e59], // Thai
  [0x0ed0, 0x0ed9], // Lao
  [0x1040, 0x1049], // Myanmar
  [0x17e0, 0x17e9], // Khmer
];

const decodeAllowedNumericEntity = (entity: string): string => {
  const match = entity.match(/^&#(?:x([0-9a-f]+)|([0-9]+));$/i);
  if (!match) return entity;
  const codePoint = Number.parseInt(match[1] ?? match[2], match[1] ? 16 : 10);
  const isAscii = codePoint >= 0x20 && codePoint <= 0x7e;
  const isEmoji = codePoint >= 0x1f100 && codePoint <= 0x1faff;
  if (!Number.isInteger(codePoint) || (!isAscii && !isEmoji)) return entity;
  return String.fromCodePoint(codePoint);
};

const normalizeUnicodeDigits = (value: string): string => value.replace(/[\p{Nd}]/gu, (character) => {
  const codePoint = character.codePointAt(0);
  if (codePoint === undefined) return character;
  const range = DECIMAL_DIGIT_RANGES.find(([start, end]) => codePoint >= start && codePoint <= end);
  return range ? String(codePoint - range[0]) : character;
});

const HTML_ENTITY_REPLACEMENTS: Record<string, string> = {
  '&amp;': '&',
  '&period;': '.',
  '&dot;': '.',
  '&colon;': ':',
  '&sol;': '/',
  '&commat;': '@',
  '&lbrack;': '[',
  '&rbrack;': ']',
  '&lpar;': '(',
  '&rpar;': ')',
  '&lcub;': '{',
  '&rcub;': '}',
  '&nbsp;': ' ',
};

const decodeModerationEntities = (value: string): string => {
  let current = value;
  for (let pass = 0; pass < 3; pass += 1) {
    const decoded = current
      .replace(/&(?:amp|period|dot|colon|sol|commat|lbrack|rbrack|lpar|rpar|lcub|rcub|nbsp);/gi, (entity) => {
        return HTML_ENTITY_REPLACEMENTS[entity.toLowerCase()] ?? entity;
      })
      .replace(/&#(?:x0*2e|46);/gi, '.')
      .replace(/&#(?:x0*3a|58);/gi, ':')
      .replace(/&#(?:x0*2f|47);/gi, '/')
      .replace(/&#(?:x0*40|64);/gi, '@')
      .replace(/&#(?:x[0-9a-f]+|[0-9]+);/gi, decodeAllowedNumericEntity);
    if (decoded === current) break;
    current = decoded;
  }
  return current;
};

const decodeModerationPercentEncoding = (value: string): string => {
  let current = value;
  for (let pass = 0; pass < 3; pass += 1) {
    try {
      const decoded = decodeURIComponent(current);
      if (decoded === current) break;
      current = decoded;
    } catch {
      break;
    }
  }
  return current;
};

/**
 * Build a scan-only representation. The original post is never rewritten or
 * persisted; this view exists only to catch defanged/obfuscated candidates.
 */
export type UnicodeModerationScan = Pick<ReturnType<typeof analyze>, 'normalized' | 'spoofed' | 'signals'>;

export const analyzeForModeration = (input: string): UnicodeModerationScan => {
  let value = input.normalize('NFKC').replace(ZERO_WIDTH_PATTERN, '').replace(EMOJI_MODIFIER_PATTERN, '');
  value = decodeModerationEntities(value);
  value = decodeModerationPercentEncoding(value);
  value = normalizeRegionalIndicators(value);
  value = normalizeEmojiLetters(value);
  value = removeInterspersedPictographs(value);
  value = normalizeUnicodeDigits(value).replace(UNICODE_DOT_PATTERN, '.').replace(DEFANGED_DOT_PATTERN, '.');

  // Restore split/defanged schemes: h t t p, hxxp, and bracketed separators.
  value = value.replace(
    /\bh\s*t\s*t\s*p\s*(s?)\s*[:：]\s*\/{1,3}/gi,
    (_match, secure: string) => (secure ? 'https://' : 'http://'),
  );
  value = value.replace(
    /\bh\s*x\s*x\s*p\s*(s?)\s*[:：]\s*\/{1,3}/gi,
    (_match, secure: string) => (secure ? 'https://' : 'http://'),
  );

  // Restore "w w w", "w.w.w" and similar split host prefixes.
  value = value.replace(/\bw(?:\s*[._\-·•‐‑‒–—]?\s*w){2}\b/gi, 'www');

  // Restore common defanged separators and words used in place of dots.
  value = value
    .replace(/(?:\[|\(|\{|<)\s*(?:dot|chấm|\.)\s*(?:\]|\)|\}|>)/gi, '.')
    .replace(/\b(?:dot|chấm)\b/gi, '.')
    .replace(/\\([.:/@])/g, '$1')
    .replace(/\s*([.:/@])\s*/g, '$1')
    .replace(/\s*([[\]{}])\s*/g, '$1');

  // Join characters separated one-by-one ("e x a m p l e . c o m").
  // This is scan-only and deliberately limited to runs of three or more
  // alphanumeric characters so ordinary word spacing is left untouched.
  value = value.replace(/\b(?:[a-z0-9]\s+){2,}[a-z0-9]\b/gi, (match) => match.replace(/\s+/g, ''));

  const unicodeScan = analyze(value);
  return {
    normalized: unicodeScan.normalized,
    spoofed: unicodeScan.spoofed,
    signals: unicodeScan.signals,
  };
};

export const normalizeForModeration = (input: string): string => analyzeForModeration(input).normalized;

export const findModerationMatches = (text: string, pattern: RegExp): string[] => {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  return text.match(new RegExp(pattern.source, flags)) ?? [];
};
