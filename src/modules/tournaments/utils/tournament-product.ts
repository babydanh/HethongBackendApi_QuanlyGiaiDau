export type TournamentProductConfig = Record<string, unknown>;

/**
 * Normalize the JSONB value before applying product rules.
 * The database stores this field as JSONB, while a few legacy read paths may
 * still hand the service a serialized JSON string.
 */
export function normalizeTournamentProductConfig(
  value: unknown,
): TournamentProductConfig {
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as TournamentProductConfig)
        : {};
    } catch {
      return {};
    }
  }

  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as TournamentProductConfig)
    : {};
}

/**
 * `isLite` identifies the Lite/Quick product family, not its compact UI.
 * The legacy mode marker is accepted only with hideAdvancedSettings so that
 * scoring mode LITE on an Advanced tournament cannot change its product.
 */
export function isLiteTournamentProduct(
  config: TournamentProductConfig,
): boolean {
  if (Object.prototype.hasOwnProperty.call(config, 'isLite')) {
    return config.isLite === true;
  }

  return (
    String(config.mode || '').toUpperCase() === 'LITE' &&
    config.hideAdvancedSettings === true
  );
}

/** The compact product requires both the Lite family and the hide marker. */
export function isSuperLiteTournamentProduct(
  config: TournamentProductConfig,
): boolean {
  return (
    isLiteTournamentProduct(config) && config.hideAdvancedSettings === true
  );
}
