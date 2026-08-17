export declare class MediaWebhookDto {
    event: 'on_publish' | 'on_read' | 'on_done' | 'on_error';
    streamName: string;
    reason?: string;
}
