import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PairLiteParticipantsBatchDto } from './pair-lite-participants-batch.dto';

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';
const validPair = { participant1Id: UUID_A, participant2Id: UUID_B };

const errorsFor = (pairs: unknown[]) =>
  validate(plainToInstance(PairLiteParticipantsBatchDto, { pairs }));

describe('PairLiteParticipantsBatchDto', () => {
  it('TC-FEAT-06 accepts a batch of 1 to 12 pairs', async () => {
    expect(await errorsFor([validPair])).toHaveLength(0);
    expect(
      await errorsFor(Array.from({ length: 12 }, () => validPair)),
    ).toHaveLength(0);
  });

  it('TC-FEAT-07 rejects an empty batch', async () => {
    expect(await errorsFor([])).not.toHaveLength(0);
  });

  it('TC-FEAT-08 rejects more than 12 pairs', async () => {
    expect(
      await errorsFor(Array.from({ length: 13 }, () => validPair)),
    ).not.toHaveLength(0);
  });

  it('TC-FEAT-09 rejects a pair whose participant id is not a UUID', async () => {
    expect(
      await errorsFor([{ participant1Id: 'not-a-uuid', participant2Id: UUID_B }]),
    ).not.toHaveLength(0);
  });
});
