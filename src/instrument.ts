import * as Sentry from '@sentry/nestjs';

const dsn = process.env.SENTRY_DSN?.trim();

function getSampleRate(value: string | undefined): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return 0.1;
  }

  return Math.min(Math.max(parsed, 0), 1);
}

if (dsn) {
  Sentry.init({
    dsn,
    enabled: true,
    environment:
      process.env.SENTRY_ENVIRONMENT?.trim() ||
      process.env.NODE_ENV ||
      'production',
    release: process.env.SENTRY_RELEASE?.trim() || undefined,
    tracesSampleRate: getSampleRate(process.env.SENTRY_TRACES_SAMPLE_RATE),
    sendDefaultPii: false,
    initialScope: {
      tags: {
        service: 'backend-api',
      },
    },
  });
}
