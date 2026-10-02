import * as Sentry from '@sentry/nestjs';

function scrubLocationData(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrubLocationData);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => {
    if (/^(lat|latitude|lng|lon|longitude|coordinates|query_string|params)$/i.test(key)) return [key, '[Filtered]'];
    return [key, scrubLocationData(item)];
  }));
}

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
    beforeSend(event) {
      const locationRequest = /\/(social-sessions|socials)\/nearby|\/regions\/resolve/.test(event.request?.url ?? '');
      if (event.request?.url) {
        try { event.request.url = new URL(event.request.url).origin + new URL(event.request.url).pathname; }
        catch { event.request.url = event.request.url.split('?')[0]; }
      }
      if (event.request) {
        delete event.request.query_string;
        event.request.data = scrubLocationData(event.request.data);
      }
      if (event.extra) event.extra = scrubLocationData(event.extra) as typeof event.extra;
      if (event.breadcrumbs) {
        event.breadcrumbs = event.breadcrumbs.map((breadcrumb) => {
          if (breadcrumb.data) {
            breadcrumb.data = scrubLocationData(breadcrumb.data) as typeof breadcrumb.data;
            const url = breadcrumb.data.url;
            if (typeof url === 'string') {
              try {
                const parsed = new URL(url);
                breadcrumb.data.url = parsed.origin + parsed.pathname;
              } catch {
                breadcrumb.data.url = url.split('?')[0];
              }
            }
          }
          if (locationRequest && breadcrumb.message) {
            breadcrumb.message = 'Location request breadcrumb';
          }
          return breadcrumb;
        });
      }
      if (locationRequest && event.exception?.values) {
        event.exception.values = event.exception.values.map((value) => ({
          ...value,
          value: 'Location request failed',
        }));
      }
      return event;
    },
    initialScope: {
      tags: {
        service: 'backend-api',
      },
    },
  });
}
