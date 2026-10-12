import { validate } from 'class-validator';
import {
  RosterImportBatchDto,
  RosterImportBatchGroupDto,
  RosterImportBatchItemDto,
} from './roster-import-batch.dto';

import type { ValidationError } from 'class-validator';

function flattenErrors(errors: ValidationError[]): ValidationError[] {
  return errors.flatMap((error) => [
    error,
    ...flattenErrors(error.children ?? []),
  ]);
}

const validParticipant = () =>
  Object.assign(new RosterImportBatchItemDto(), {
    teamName: 'Synthetic pair',
    player1Name: 'Synthetic player one',
    player1Email: 'player1@example.test',
    player2Name: 'Synthetic player two',
    player2Email: 'player2@example.test',
    source: 'EXCEL',
  });

const validBatch = () =>
  Object.assign(new RosterImportBatchDto(), {
    groups: [
      Object.assign(new RosterImportBatchGroupDto(), {
        divisionId: '11111111-1111-4111-8111-111111111111',
        participants: [validParticipant()],
      }),
    ],
  });

describe('RosterImportBatchDto', () => {
  it('accepts bounded worksheet provenance fields under strict whitelisting', async () => {
    const batch = validBatch();
    Object.assign(batch.groups[0].participants[0], {
      sourceSheetName: 'Singles',
      sourceRowIndex: 2,
    });

    expect(
      await validate(batch, { whitelist: true, forbidNonWhitelisted: true }),
    ).toHaveLength(0);
  });

  it('rejects worksheet provenance outside Excel limits', async () => {
    const batch = validBatch();
    Object.assign(batch.groups[0].participants[0], {
      sourceSheetName: 'S'.repeat(32),
      sourceRowIndex: 1048577,
    });

    const errors = flattenErrors(
      await validate(batch, { whitelist: true, forbidNonWhitelisted: true }),
    );
    expect(errors.some((error) => error.constraints?.maxLength)).toBe(true);
    expect(errors.some((error) => error.constraints?.max)).toBe(true);
  });

  it('accepts existing division groups and nested roster rows', async () => {
    expect(await validate(validBatch())).toHaveLength(0);
  });

  it('accepts a division-less group for a tournament without divisions', async () => {
    const batch = validBatch();
    batch.groups[0].divisionId = null;

    expect(await validate(batch)).toHaveLength(0);
  });
  it('allows batch rows to omit player-one email for offline registration', async () => {
    const batch = validBatch();
    Object.assign(batch.groups[0].participants[0], { player1Email: undefined });

    const errors = flattenErrors(
      await validate(batch, { whitelist: true, forbidNonWhitelisted: true }),
    );

    expect(errors.some((error) => error.property === 'player1Email')).toBe(false);
  });

  it('rejects a malformed organizer-confirmed account id', async () => {
    const batch = validBatch();
    batch.groups[0].participants[0].confirmedPlayer1UserId = 'not-a-uuid';

    const errors = await validate(batch, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(
      flattenErrors(errors).some(
        (error) => error.property === 'confirmedPlayer1UserId',
      ),
    ).toBe(true);
  });

  it('rejects unknown workbook-derived properties instead of mass-assigning them', async () => {
    const batch = validBatch();
    Object.assign(batch.groups[0].participants[0], {
      isWildcard: true,
      createdBy: 'attacker-controlled',
    });

    const errors = await validate(batch, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(
      flattenErrors(errors).some(
        (error) =>
          error.property === 'isWildcard' &&
          error.constraints?.whitelistValidation,
      ),
    ).toBe(true);
});
});
