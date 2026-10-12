import { Body, Controller, Module, Post } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import {
  configureRosterImportBodyParser,
  ROSTER_IMPORT_BATCH_JSON_BODY_LIMIT_BYTES,
} from './roster-import-body-parser';

type BatchBody = {
  groups?: Array<{
    participants?: Array<{
      customResponses?: Record<string, unknown>;
    }>;
  }>;
};

@Controller('tournaments/:tournamentId/roster-import-batches')
class RosterImportBodyParserProbeController {
  @Post('preview')
  preview(@Body() body: BatchBody) {
    const participants =
      body.groups?.flatMap((group) => group.participants ?? []) ?? [];
    const responses = participants[0]?.customResponses ?? {};
    return {
      participantCount: participants.length,
      notesLength:
        typeof responses.notes === 'string' ? responses.notes.length : 0,
      customResponseLength:
        typeof responses.approvedField === 'string'
          ? responses.approvedField.length
          : 0,
    };
  }

  @Post()
  commit(@Body() body: { marker?: string }) {
    return { markerLength: body.marker?.length ?? 0 };
  }
}

@Controller('body-parser-probe')
class DefaultJsonBodyParserProbeController {
  @Post()
  echo(@Body() body: { value?: string }) {
    return { valueLength: body.value?.length ?? 0 };
  }
}

@Controller('body-parser-form-probe')
class UrlEncodedBodyParserProbeController {
  @Post()
  echo(@Body() body: { value?: string }) {
    return { valueLength: body.value?.length ?? 0 };
  }
}

@Module({
  controllers: [
    RosterImportBodyParserProbeController,
    DefaultJsonBodyParserProbeController,
    UrlEncodedBodyParserProbeController,
  ],
})
class RosterImportBodyParserProbeModule {}

describe('roster import JSON body parser', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await NestFactory.create<NestExpressApplication>(
      RosterImportBodyParserProbeModule,
      { bodyParser: false, logger: false },
    );
    configureRosterImportBodyParser(app);
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('accepts 500 participants with maximum notes and custom text responses', async () => {
    const notes = '\u0001'.repeat(2000);
    const customResponse = '\u0001'.repeat(4000);
    const participants = Array.from({ length: 500 }, (_, index) => ({
      teamName: 'Synthetic team',
      player1Name: `Synthetic player ${index}`,
      player1Email: `player${index}@example.test`,
      source: 'EXCEL',
      customResponses: {
        notes,
        approvedField: customResponse,
      },
    }));
    const body = JSON.stringify({
      groups: [{ divisionId: null, participants }],
    });

    const bodyBytes = Buffer.byteLength(body, 'utf8');

    expect(bodyBytes).toBeGreaterThan(100 * 1024);
    expect(bodyBytes).toBeLessThan(
      ROSTER_IMPORT_BATCH_JSON_BODY_LIMIT_BYTES,
    );

    await request(app.getHttpServer())
      .post(
        '/api/v1/tournaments/tournament-id/roster-import-batches/preview',
      )
      .set('content-type', 'application/json')
      .send(body)
      .expect(201)
      .expect({
        participantCount: 500,
        notesLength: 2000,
        customResponseLength: 4000,
      });
  });

  it('applies the larger limit to the batch commit route', async () => {
    const marker = 'x'.repeat(200 * 1024);
    const body = JSON.stringify({ marker });

    await request(app.getHttpServer())
      .post('/api/v1/tournaments/tournament-id/roster-import-batches')
      .set('content-type', 'application/json')
      .send(body)
      .expect(201)
      .expect({ markerLength: marker.length });
  });

  it('preserves ordinary JSON and URL-encoded parser behavior', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/body-parser-probe')
      .set('content-type', 'application/json')
      .send(JSON.stringify({ value: 'accepted' }))
      .expect(201)
      .expect({ valueLength: 'accepted'.length });

    await request(app.getHttpServer())
      .post('/api/v1/body-parser-form-probe')
      .type('form')
      .send({ value: 'accepted' })
      .expect(201)
      .expect({ valueLength: 'accepted'.length });

    const oversizedBody = JSON.stringify({ value: 'x'.repeat(200 * 1024) });
    await request(app.getHttpServer())
      .post('/api/v1/body-parser-probe')
      .set('content-type', 'application/json')
      .send(oversizedBody)
      .expect(413);
  });

  it('rejects batch JSON larger than the explicit transport cap', async () => {
    const oversizedBody = `{"value":"${'x'.repeat(
      ROSTER_IMPORT_BATCH_JSON_BODY_LIMIT_BYTES,
    )}"}`;
    expect(Buffer.byteLength(oversizedBody, 'utf8')).toBeGreaterThan(
      ROSTER_IMPORT_BATCH_JSON_BODY_LIMIT_BYTES,
    );

    await request(app.getHttpServer())
      .post(
        '/api/v1/tournaments/tournament-id/roster-import-batches/preview',
      )
      .set('content-type', 'application/json')
      .send(oversizedBody)
      .expect(413);
  });
});
