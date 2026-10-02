import { BadRequestException } from '@nestjs/common';
import { assertDivisionHasRoom } from '../services/tournament-capacity.service';

describe('division capacity admission', () => {
  it('admits the eighth doubles member into a four-team division', () => {
    expect(() =>
      assertDivisionHasRoom(
        { occupiedTeamSlots: 3.5, maxTeamSlots: 4, isFull: false },
        'DOUBLES',
        1,
      ),
    ).not.toThrow();
  });

  it('rejects a ninth doubles member at four team slots', () => {
    expect(() =>
      assertDivisionHasRoom(
        { occupiedTeamSlots: 4, maxTeamSlots: 4, isFull: true },
        'DOUBLES',
        1,
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects a full doubles pair when only half a team is left', () => {
    expect(() =>
      assertDivisionHasRoom(
        { occupiedTeamSlots: 3.5, maxTeamSlots: 4, isFull: false },
        'DOUBLES',
        2,
      ),
    ).toThrow(BadRequestException);
  });

  it('admits a member while four unpaired members still hold only half capacity', () => {
    expect(() =>
      assertDivisionHasRoom(
        { occupiedTeamSlots: 2, maxTeamSlots: 4, isFull: false },
        'DOUBLES',
        1,
      ),
    ).not.toThrow();
  });

  it('keeps singles registration in whole team units', () => {
    expect(() =>
      assertDivisionHasRoom(
        { occupiedTeamSlots: 3, maxTeamSlots: 4, isFull: false },
        'SINGLES',
        1,
      ),
    ).not.toThrow();

    expect(() =>
      assertDivisionHasRoom(
        { occupiedTeamSlots: 4, maxTeamSlots: 4, isFull: true },
        'SINGLES',
        1,
      ),
    ).toThrow(BadRequestException);
  });

  it('does not block an uncapped division', () => {
    expect(() =>
      assertDivisionHasRoom(
        { occupiedTeamSlots: 99, maxTeamSlots: null, isFull: false },
        'DOUBLES',
        1,
      ),
    ).not.toThrow();
  });
});
