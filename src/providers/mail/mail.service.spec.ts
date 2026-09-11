import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { MailService } from './mail.service';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));

describe('MailService', () => {
  const createTransportMock = nodemailer.createTransport as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function createConfig(values: Record<string, string>): ConfigService {
    return {
      get: jest.fn((key: string) => values[key]),
    } as unknown as ConfigService;
  }

  it('uses Lark SSL defaults and verifies the transporter without logging credentials', async () => {
    const transport = {
      verify: jest.fn().mockResolvedValue(true),
      sendMail: jest.fn().mockResolvedValue({}),
    };
    createTransportMock.mockReturnValue(transport);

    const service = new MailService(
      createConfig({
        NODE_ENV: 'production',
        SMTP_USER: 'noreply@sporto.asia',
        SMTP_PASS: '<test-secret>',
      }),
    );

    expect(createTransportMock).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.larksuite.com',
        port: 465,
        secure: true,
        auth: {
          user: 'noreply@sporto.asia',
          pass: '<test-secret>',
        },
      }),
    );

    await service.onModuleInit();
    await service.sendMail('recipient@example.com', 'Verify', '<p>Verify</p>');

    expect(transport.verify).toHaveBeenCalledTimes(1);
    expect(transport.sendMail).toHaveBeenCalledWith({
      from: '"Noreply" <noreply@sporto.asia>',
      to: 'recipient@example.com',
      subject: 'Verify',
      html: '<p>Verify</p>',
    });
  });

  it('does not silently mock email in production when SMTP credentials are missing', async () => {
    const service = new MailService(
      createConfig({
        NODE_ENV: 'production',
        SMTP_USER: 'noreply@sporto.asia',
      }),
    );

    await expect(
      service.sendMail('recipient@example.com', 'Verify', '<p>Verify</p>'),
    ).rejects.toThrow('SMTP_NOT_CONFIGURED');
  });
});
