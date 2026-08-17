"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isStoredImageUrl = isStoredImageUrl;
exports.extractStoredImagePublicId = extractStoredImagePublicId;
function isStoredImageUrl(url) {
    if (!url) {
        return false;
    }
    try {
        const parsedUrl = new URL(url);
        return parsedUrl.pathname.includes('/image/upload/');
    }
    catch {
        return false;
    }
}
function extractStoredImagePublicId(url) {
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
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=cloudinary.helper.js.map