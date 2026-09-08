const INTEGER_FIELDS = new Set([
  'bestOf',
  'setsToWin',
  'pointsPerSet',
  'maxPoints',
  'maxPointsPerSet',
  'tiebreakAt',
  'tiebreakPoints',
]);

const BOOLEAN_FIELDS = new Set(['mustWinByTwo']);
const STRING_FIELDS = new Set(['scoringModel']);
const SCORING_MODELS = new Set([
  'TENNIS_GAME',
  'TENNIS_SET',
  'PICKLEBALL_SIDE_OUT',
  'RALLY_POINT_SET',
  'FOOTBALL',
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function sanitizePreset(value: unknown): Record<string, unknown> | null {
  const input = asRecord(value);
  if (!input) return null;
  const output: Record<string, unknown> = {};

  for (const [key, rawValue] of Object.entries(input)) {
    if (INTEGER_FIELDS.has(key)) {
      const numberValue =
        typeof rawValue === 'number' ? rawValue : Number(rawValue);
      if (
        Number.isInteger(numberValue) &&
        numberValue >= 1 &&
        numberValue <= 99
      ) {
        output[key] = numberValue;
      }
      continue;
    }
    if (BOOLEAN_FIELDS.has(key)) {
      if (typeof rawValue === 'boolean') output[key] = rawValue;
      continue;
    }
    if (STRING_FIELDS.has(key)) {
      const stringValue = String(rawValue).trim().toUpperCase();
      if (SCORING_MODELS.has(stringValue)) output[key] = stringValue;
    }
  }

  return Object.keys(output).length > 0 ? output : null;
}

/** Keep only bounded, known scoring fields before persisting club settings. */
export function sanitizeScoringPresets(value: unknown): Record<string, unknown> {
  const input = asRecord(value);
  if (!input) return {};
  const output: Record<string, unknown> = {};
  for (const [sport, rawPreset] of Object.entries(input)) {
    const normalizedSport = sport.trim().toLowerCase();
    if (!/^[a-z0-9_-]{1,50}$/.test(normalizedSport)) continue;
    const preset = sanitizePreset(rawPreset);
    if (preset) output[normalizedSport] = preset;
  }
  return output;
}

export function selectScoringPreset(
  presets: unknown,
  sportSlug: string | null | undefined,
): Record<string, unknown> {
  if (!sportSlug) return {};
  const normalizedSport = sportSlug.trim().toLowerCase();
  const all = sanitizeScoringPresets(presets);
  return (
    (all[normalizedSport] as Record<string, unknown> | undefined) ??
    (all[normalizedSport.replace(/-/g, '_')] as Record<string, unknown> | undefined) ??
    {}
  );
}
