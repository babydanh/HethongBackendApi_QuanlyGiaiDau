import { AiService } from './ai.service';
import type { Request, Response } from 'express';
export declare class AiController {
    private readonly aiService;
    constructor(aiService: AiService);
    private getUserIdFromRequest;
    chat(messages: any[], currentUrl: string, pageTitle: string, isMobile: boolean, searchParams: string, req: Request, res: Response): Promise<void>;
    message(messages: any[], singleMessage: string, currentUrl: string, pageTitle: string, isMobile: boolean, searchParams: string, req: Request): Promise<{
        success: boolean;
        reply: string;
        data: string;
    }>;
}
