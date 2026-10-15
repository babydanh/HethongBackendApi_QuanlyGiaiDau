import { BadRequestException } from '@nestjs/common';
import {
  COURT_STATE_HISTORY_LIMIT,
  mergeCourtStateIntoScoreDetails,
  normalizeCourtState,
  preserveStoredCourtState,
} from './court-state.utils';

const NOW = new Date('2026-10-15T08:00:00.000Z');

const snapshot = () => ({
  version: 1,
  startingRight: { team1: 0, team2: 1 },
  endsOverride: null,
  autoSwitchEnds: true,
  midSetSwitchDone: false,
  serverOverride: null,
  turnStart: { team: 1, serverNumber: 2, teamScoreAtStart: 3, serverPlayerIndex: 1 },
});

const courtStateInput = () => ({ ...snapshot(), history: [] });

const omit = (value: Record<string, unknown>, key: string) => {
  const copy = { ...value };
  delete copy[key];
  return copy;
};

describe('court-state utils', () => {
  describe('normalizeCourtState', () => {
    it('accepts a valid CourtState and stamps updatedAt/updatedBy on the server', () => {
      const result = normalizeCourtState(
        {
          ...courtStateInput(),
          updatedAt: '1999-01-01T00:00:00.000Z',
          updatedBy: 'spoofed-user',
        },
        'referee-1',
        NOW,
      );

      expect(result).toEqual({
        ...snapshot(),
        history: [],
        updatedAt: '2026-10-15T08:00:00.000Z',
        updatedBy: 'referee-1',
      });
    });

    it('accepts boolean endsOverride and a serverOverride object', () => {
      const result = normalizeCourtState(
        {
          ...courtStateInput(),
          endsOverride: true,
          serverOverride: { team: 2, playerIndex: 0 },
          turnStart: null,
        },
        'referee-1',
        NOW,
      );

      expect(result.endsOverride).toBe(true);
      expect(result.serverOverride).toEqual({ team: 2, playerIndex: 0 });
      expect(result.turnStart).toBeNull();
    });

    it('strips unknown keys and nested history from snapshots', () => {
      const result = normalizeCourtState(
        {
          ...courtStateInput(),
          extra: 'ignored',
          history: [
            { ...snapshot(), extra: 'ignored', history: [{ ...snapshot() }] },
          ],
        },
        'referee-1',
        NOW,
      );

      expect(result).not.toHaveProperty('extra');
      expect(result.history).toHaveLength(1);
      expect(result.history[0]).toEqual(snapshot());
    });

    it('keeps only the newest 20 history snapshots, in order', () => {
      const history = Array.from({ length: 25 }, (_, index) => ({
        ...snapshot(),
        turnStart: {
          team: 1,
          serverNumber: 1,
          teamScoreAtStart: index,
          serverPlayerIndex: 0,
        },
      }));

      const result = normalizeCourtState(
        { ...courtStateInput(), history },
        'referee-1',
        NOW,
      );

      expect(COURT_STATE_HISTORY_LIMIT).toBe(20);
      expect(result.history).toHaveLength(20);
      expect(
        result.history.map((item) => item.turnStart?.teamScoreAtStart),
      ).toEqual(Array.from({ length: 20 }, (_, index) => index + 5));
    });

    it.each<[string, () => unknown, string]>([
      [
        'courtState không phải object',
        () => 'nope',
        'courtState phải là object CourtState.',
      ],
      [
        'version khác 1',
        () => ({ ...courtStateInput(), version: 2 }),
        'courtState.version phải là 1.',
      ],
      [
        'thiếu startingRight',
        () => omit(courtStateInput(), 'startingRight'),
        'courtState.startingRight phải là object { team1, team2 }.',
      ],
      [
        'startingRight.team1 ngoài 0|1',
        () => ({ ...courtStateInput(), startingRight: { team1: 2, team2: 0 } }),
        'courtState.startingRight.team1 chỉ được là 0 hoặc 1.',
      ],
      [
        'endsOverride không phải boolean/null',
        () => ({ ...courtStateInput(), endsOverride: 'yes' }),
        'courtState.endsOverride phải là boolean hoặc null.',
      ],
      [
        'thiếu endsOverride',
        () => omit(courtStateInput(), 'endsOverride'),
        'courtState.endsOverride phải là boolean hoặc null.',
      ],
      [
        'autoSwitchEnds là chuỗi',
        () => ({ ...courtStateInput(), autoSwitchEnds: 'true' }),
        'courtState.autoSwitchEnds phải là boolean.',
      ],
      [
        'thiếu midSetSwitchDone',
        () => omit(courtStateInput(), 'midSetSwitchDone'),
        'courtState.midSetSwitchDone phải là boolean.',
      ],
      [
        'serverOverride.team = 3',
        () => ({ ...courtStateInput(), serverOverride: { team: 3, playerIndex: 0 } }),
        'courtState.serverOverride.team chỉ được là 1 hoặc 2.',
      ],
      [
        'serverOverride.playerIndex = 2',
        () => ({ ...courtStateInput(), serverOverride: { team: 1, playerIndex: 2 } }),
        'courtState.serverOverride.playerIndex chỉ được là 0 hoặc 1.',
      ],
      [
        'thiếu serverOverride',
        () => omit(courtStateInput(), 'serverOverride'),
        'courtState.serverOverride phải là null hoặc object { team, playerIndex }.',
      ],
      [
        'turnStart.serverNumber = 3',
        () => ({
          ...courtStateInput(),
          turnStart: { team: 1, serverNumber: 3, teamScoreAtStart: 0, serverPlayerIndex: 0 },
        }),
        'courtState.turnStart.serverNumber chỉ được là 1 hoặc 2.',
      ],
      [
        'turnStart.teamScoreAtStart âm',
        () => ({
          ...courtStateInput(),
          turnStart: { team: 1, serverNumber: 1, teamScoreAtStart: -1, serverPlayerIndex: 0 },
        }),
        'courtState.turnStart.teamScoreAtStart phải là số nguyên không âm.',
      ],
      [
        'turnStart.teamScoreAtStart là số thập phân',
        () => ({
          ...courtStateInput(),
          turnStart: { team: 1, serverNumber: 1, teamScoreAtStart: 1.5, serverPlayerIndex: 0 },
        }),
        'courtState.turnStart.teamScoreAtStart phải là số nguyên không âm.',
      ],
      [
        'turnStart.serverPlayerIndex = 5',
        () => ({
          ...courtStateInput(),
          turnStart: { team: 1, serverNumber: 1, teamScoreAtStart: 0, serverPlayerIndex: 5 },
        }),
        'courtState.turnStart.serverPlayerIndex chỉ được là 0 hoặc 1.',
      ],
      [
        'history không phải mảng',
        () => ({ ...courtStateInput(), history: {} }),
        'courtState.history phải là mảng snapshot.',
      ],
      [
        'thiếu history',
        () => omit(courtStateInput(), 'history'),
        'courtState.history phải là mảng snapshot.',
      ],
      [
        'history[1] sai version',
        () => ({
          ...courtStateInput(),
          history: [snapshot(), { ...snapshot(), version: 0 }],
        }),
        'courtState.history[1].version phải là 1.',
      ],
      [
        'history[0].turnStart.team = 0',
        () => ({
          ...courtStateInput(),
          history: [
            {
              ...snapshot(),
              turnStart: { team: 0, serverNumber: 1, teamScoreAtStart: 0, serverPlayerIndex: 0 },
            },
          ],
        }),
        'courtState.history[0].turnStart.team chỉ được là 1 hoặc 2.',
      ],
    ])('rejects %s with 400', (_label, build, message) => {
      expect(() => normalizeCourtState(build(), 'referee-1', NOW)).toThrow(
        new BadRequestException(message),
      );
    });
  });

  describe('mergeCourtStateIntoScoreDetails', () => {
    it('adds courtState and leaves sets and other score fields untouched', () => {
      const existing = {
        sets: [{ team1Score: 11, team2Score: 4, isFinished: true }],
        note: 'kept',
      };
      const courtState = normalizeCourtState(courtStateInput(), 'referee-1', NOW);

      const merged = mergeCourtStateIntoScoreDetails(existing, courtState);

      expect(merged).toEqual({ ...existing, courtState });
      expect(merged.sets).toEqual(existing.sets);
    });

    it('treats missing existing scoreDetails as an empty object', () => {
      const courtState = normalizeCourtState(courtStateInput(), 'referee-1', NOW);

      expect(mergeCourtStateIntoScoreDetails(null, courtState)).toEqual({ courtState });
    });
  });

  describe('preserveStoredCourtState', () => {
    const stored = normalizeCourtState(courtStateInput(), 'referee-1', NOW);

    it('keeps the stored courtState when the score payload omits it', () => {
      const payload = { sets: [{ team1Score: 11, team2Score: 5, isFinished: true }] };

      const next = preserveStoredCourtState(payload, { courtState: stored });

      expect(next).toEqual({ ...payload, courtState: stored });
    });

    it('replaces a courtState sent by the score payload with the stored one', () => {
      const staleCopy = { ...stored, startingRight: { team1: 1, team2: 1 } };

      const next = preserveStoredCourtState(
        { sets: [], courtState: staleCopy },
        { courtState: stored },
      );

      expect(next.courtState).toEqual(stored);
    });

    it('drops a client courtState when nothing is stored yet', () => {
      const next = preserveStoredCourtState(
        { sets: [], courtState: { version: 1 } },
        { sets: [] },
      );

      expect(next).toEqual({ sets: [] });
    });

    it('does not mutate the payload it receives', () => {
      const payload = { sets: [] as unknown[] };

      preserveStoredCourtState(payload, { courtState: stored });

      expect(payload).toEqual({ sets: [] });
    });
  });
});
