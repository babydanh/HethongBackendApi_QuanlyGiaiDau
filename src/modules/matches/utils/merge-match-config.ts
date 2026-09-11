export function mergeMatchConfig(
  existing: unknown,
  patch: Record<string, unknown> | null,
): Record<string, unknown> {
  if (patch === null) return {};

  const existingRecord =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? (existing as Record<string, unknown>)
      : {};

  return { ...existingRecord, ...patch };
}
