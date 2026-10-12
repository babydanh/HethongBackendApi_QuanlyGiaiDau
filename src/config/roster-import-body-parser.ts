import type { IncomingMessage } from 'node:http';
import type { NestExpressApplication } from '@nestjs/platform-express';

// 500 rows with max-length notes and one max-length TEXT response can serialize
// to about 18 MB when control characters are JSON-escaped. This is a transport
// ceiling; custom-field count and several core string lengths are not bounded.
export const ROSTER_IMPORT_BATCH_JSON_BODY_LIMIT_BYTES = 20 * 1024 * 1024;

const DEFAULT_JSON_BODY_LIMIT_BYTES = 100 * 1024;
const DEFAULT_URLENCODED_BODY_LIMIT_BYTES = 100 * 1024;
const ROSTER_IMPORT_BATCH_PATH =
  /^\/api\/v1\/tournaments\/[^/?]+\/roster-import-batches(?:\/preview)?\/?(?:\?.*)?$/;

function isRosterImportBatchJsonRequest(request: IncomingMessage): boolean {
  if (request.method !== 'POST' || typeof request.url !== 'string') {
    return false;
  }

  const mediaType = request.headers['content-type']
    ?.split(';', 1)[0]
    ?.trim()
    .toLowerCase();

  return (
    mediaType === 'application/json' && ROSTER_IMPORT_BATCH_PATH.test(request.url)
  );
}

export function configureRosterImportBodyParser(
  app: NestExpressApplication,
): void {
  app.useBodyParser('json', {
    limit: ROSTER_IMPORT_BATCH_JSON_BODY_LIMIT_BYTES,
    type: isRosterImportBatchJsonRequest,
  });
  app.useBodyParser('json', { limit: DEFAULT_JSON_BODY_LIMIT_BYTES });
  app.useBodyParser('urlencoded', {
    extended: true,
    limit: DEFAULT_URLENCODED_BODY_LIMIT_BYTES,
  });
}
