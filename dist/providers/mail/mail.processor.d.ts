import { WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { MailService } from './mail.service';
export declare class MailProcessor extends WorkerHost {
    private readonly mailService;
    constructor(mailService: MailService);
    process(job: Job<{
        to: string;
        subject: string;
        html: string;
    }>): Promise<void>;
}
