export declare class CreateMessageDto {
    roomId: string;
    messageText?: string;
    attachmentsUrls?: string[];
    replyToId?: string;
    type?: string;
    metadata?: Record<string, any>;
}
