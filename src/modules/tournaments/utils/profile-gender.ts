export type NormalizedGender = 'MALE' | 'FEMALE';

/** Maps a raw profile gender label (Vietnamese or English) to MALE/FEMALE, or null when unknown. */
export function normalizeProfileGender(
  raw: string | null | undefined,
): NormalizedGender | null {
  const value = (raw ?? '').trim().toUpperCase();
  if (value === 'NAM' || value === 'MALE') return 'MALE';
  if (value === 'NỮ' || value === 'NU' || value === 'FEMALE') return 'FEMALE';
  return null;
}
