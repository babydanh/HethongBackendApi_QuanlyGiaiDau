"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractLinkPreview = extractLinkPreview;
async function extractLinkPreview(targetUrl) {
    try {
        const parsed = new URL(targetUrl);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
            return null;
        }
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        const response = await fetch(parsed.toString(), {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 SportoPreviewBot/1.0',
                'Accept': 'text/html,application/xhtml+xml',
            },
        });
        clearTimeout(timeoutId);
        if (!response.ok)
            return null;
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
            return null;
        }
        const html = await response.text();
        const headHtml = html.slice(0, 100000);
        const getMetaContent = (property, name) => {
            const propRegex = new RegExp(`<meta[^>]*property=["']${property}["'][^>]*content=["']([^"']+)["']`, 'i');
            const propRegexRev = new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*property=["']${property}["']`, 'i');
            const match = headHtml.match(propRegex) || headHtml.match(propRegexRev);
            if (match && match[1])
                return match[1].trim();
            if (name) {
                const nameRegex = new RegExp(`<meta[^>]*name=["']${name}["'][^>]*content=["']([^"']+)["']`, 'i');
                const nameRegexRev = new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*name=["']${name}["']`, 'i');
                const nameMatch = headHtml.match(nameRegex) || headHtml.match(nameRegexRev);
                if (nameMatch && nameMatch[1])
                    return nameMatch[1].trim();
            }
            return undefined;
        };
        const title = getMetaContent('og:title', 'title') || headHtml.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();
        const description = getMetaContent('og:description', 'description');
        let image = getMetaContent('og:image', 'image');
        const siteName = getMetaContent('og:site_name') || parsed.hostname;
        if (image && !image.startsWith('http')) {
            try {
                image = new URL(image, parsed.origin).toString();
            }
            catch {
                image = undefined;
            }
        }
        if (!title && !description && !image) {
            return null;
        }
        return {
            url: targetUrl,
            title: title ? decodeHtmlEntities(title) : undefined,
            description: description ? decodeHtmlEntities(description) : undefined,
            image,
            siteName,
        };
    }
    catch {
        return null;
    }
}
function decodeHtmlEntities(str) {
    return str
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ');
}
//# sourceMappingURL=link-preview.util.js.map