import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private readonly from: string;
  private readonly isProduction: boolean;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('SMTP_HOST') || 'smtp.larksuite.com';
    const configuredPort = this.configService.get<string | number>('SMTP_PORT');
    const parsedPort = Number(configuredPort);
    const port = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 465;
    const configuredSecure = this.configService.get<string | boolean>('SMTP_SECURE');
    const secure =
      typeof configuredSecure === 'boolean'
        ? configuredSecure
        : configuredSecure === undefined || configuredSecure === ''
          ? port === 465
          : configuredSecure === 'true';
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');
    this.from =
      this.configService.get<string>('SMTP_FROM') ||
      '"Noreply" <noreply@sporto.asia>';
    this.isProduction = this.configService.get<string>('NODE_ENV') === 'production';

    if (!user || !pass) {
      this.logger.warn(
        this.isProduction
          ? 'SMTP credentials are missing; production email delivery is disabled.'
          : 'SMTP credentials are missing; development email delivery will be mocked to console.',
      );
      return;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
      auth: {
        user,
        pass,
      },
    });
  }

  async onModuleInit(): Promise<void> {
    if (!this.transporter) {
      return;
    }

    try {
      await this.transporter.verify();
      this.logger.log('SMTP connection verified.');
    } catch {
      // Keep boot resilient, but make the provider problem visible without leaking credentials.
      this.logger.error(
        'SMTP connection verification failed; email jobs will remain visible as failed until the provider configuration is fixed.',
      );
    }
  }

  async sendMail(to: string, subject: string, html: string): Promise<boolean> {
    if (!this.transporter) {
      if (this.isProduction) {
        throw new Error('SMTP_NOT_CONFIGURED');
      }

      this.logger.log(
        `\n[MOCK EMAIL TO CONSOLE] --------------------------------------------\n` +
        `To: ${to}\n` +
        `Subject: ${subject}\n` +
        `Content: ${html.replace(/<[^>]*>/g, ' ')}\n` +
        `--------------------------------------------------------------------\n`
      );
      return true;
    }

    try {
      await this.transporter.sendMail({
        from: this.from,
        to,
        subject,
        html,
      });
      this.logger.log('Email successfully sent.');
      return true;
    } catch (error) {
      this.logger.error('Failed to send email via SMTP.');
      throw error;
    }
  }
}
