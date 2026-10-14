/**
 * Returns the image URL only when it is a plain https URL without credentials, otherwise null.
 * Anything a browser would load as mixed content, or that embeds a login, is never published.
 */
export function normalizeHttpsImageUrl(
  value: string | null | undefined,
): string | null {
  if (!value) return null;

  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}
