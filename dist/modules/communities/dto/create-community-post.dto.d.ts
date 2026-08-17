export declare class CreatePollDto {
    question: string;
    options: string[];
    allowMultipleAnswers?: boolean;
    allowAddOptions?: boolean;
    expiresAt?: string;
}
export declare class CreateCommunityPostDto {
    body?: string;
    mediaUrls?: string[];
    topics?: string[];
    mentions?: string[];
    poll?: CreatePollDto;
}
