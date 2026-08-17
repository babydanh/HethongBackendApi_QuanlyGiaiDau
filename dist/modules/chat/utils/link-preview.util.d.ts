export interface LinkPreviewData {
    url: string;
    title?: string;
    description?: string;
    image?: string;
    siteName?: string;
}
export declare function extractLinkPreview(targetUrl: string): Promise<LinkPreviewData | null>;
