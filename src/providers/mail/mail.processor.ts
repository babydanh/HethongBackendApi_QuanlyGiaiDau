import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { MailService } from './mail.service';

@Processor('email-delivery')
export class MailProcessor extends WorkerHost {
  constructor(private readonly mailService: MailService) {
    super();
  }

  async process(job: Job<{ to: string; subject: string; html: string }>): Promise<void> {
    const { to, subject, html } = job.data;
    await this.mailService.sendMail(to, subject, html);
  }
}
