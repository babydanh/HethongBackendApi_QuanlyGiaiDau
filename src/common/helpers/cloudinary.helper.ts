/**
 * Check if a URL is a Cloudinary-stored image (contains /image/upload/ in path).
 */
export function isStoredImageUrl(url?: string | null): boolean {
  if (!url) {
    return false;
  }

  try {
    const parsedUrl = new URL(url);
    return parsedUrl.pathname.includes('/image/upload/');
  } catch {
    return false;
  }
}

/**
 * Extract the public_id from a Cloudinary URL.
 * Example:
 *   https://res.cloudinary.com/.../image/upload/v1234567/tournahub/avatars/abc.jpg
 *   => "tournahub/avatars/abc"
 */
export function extractStoredImagePublicId(url?: string | null): string | null {
  if (!url) {
    return null;
  }

  try {
    const parsedUrl = new URL(url);
    const uploadIndex = parsedUrl.pathname.indexOf('/image/upload/');
    if (uploadIndex === -1) {
      return null;
    }

    const afterUpload = parsedUrl.pathname.slice(uploadIndex + '/image/upload/'.length);
    const pathWithoutVersion = afterUpload.replace(/^v\d+\//, '');
    const extensionIndex = pathWithoutVersion.lastIndexOf('.');
    const pathWithoutExtension = extensionIndex >= 0
      ? pathWithoutVersion.slice(0, extensionIndex)
      : pathWithoutVersion;

    return pathWithoutExtension || null;
  } catch {
    return null;
  }
}
