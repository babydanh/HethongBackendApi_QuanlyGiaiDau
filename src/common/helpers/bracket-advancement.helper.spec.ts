import {
  getDoubleEliminationShape,
  resolveLoserTargetSlot,
  resolveWinnersLoserTargetIndex,
  resolveWinnerTargetSlot,
} from './bracket-advancement.helper';

describe('bracket advancement slots', () => {
  it('builds the standard 16-slot double-elimination shape for 13 participants', () => {
    const shape = getDoubleEliminationShape(13);

    expect(shape).toEqual({
      bracketSize: 16,
      winnersRounds: 4,
      losersRounds: 6,
      winnersMatchCounts: [8, 4, 2, 1],
      losersMatchCounts: [4, 4, 2, 2, 1, 1],
    });
    expect(
      shape.winnersMatchCounts.reduce((sum, count) => sum + count, 0) +
        shape.losersMatchCounts.reduce((sum, count) => sum + count, 0) +
        1,
    ).toBe(30);
  });

  it.each(Array.from({ length: 61 }, (_, index) => index + 4))(
    'builds a complete shape for %i participants',
    (participantCount) => {
      const shape = getDoubleEliminationShape(participantCount);
      const winnersTotal = shape.winnersMatchCounts.reduce(
        (sum, count) => sum + count,
        0,
      );
      const losersTotal = shape.losersMatchCounts.reduce(
        (sum, count) => sum + count,
        0,
      );

      expect(shape.bracketSize).toBeGreaterThanOrEqual(participantCount);
      expect(shape.bracketSize & (shape.bracketSize - 1)).toBe(0);
      expect(winnersTotal).toBe(shape.bracketSize - 1);
      expect(losersTotal).toBe(shape.bracketSize - 2);
      expect(winnersTotal + losersTotal + 1).toBe(
        2 * shape.bracketSize - 2,
      );
      expect([...shape.winnersMatchCounts, ...shape.losersMatchCounts]).not.toContain(0);
    },
  );

  it.each([0, 1, 2, 3, 65, 100, 4.5])(
    'rejects unsupported participant count %s',
    (participantCount) => {
      expect(() => getDoubleEliminationShape(participantCount)).toThrow(
        RangeError,
      );
    },
  );

  it.each([4, 8, 16, 32, 64])(
    'assigns exactly two distinct feeders to every lower-bracket match for size %i',
    (bracketSize) => {
      const shape = getDoubleEliminationShape(bracketSize);
      const feeders = new Map<string, Set<string>>();
      const addFeeder = (target: string, slot: string, source: string) => {
        const targetFeeders = feeders.get(target) ?? new Set<string>();
        const edgeKey = `${slot}:${source}`;
        expect([...targetFeeders].some((entry) => entry.startsWith(`${slot}:`)))
          .toBe(false);
        targetFeeders.add(edgeKey);
        feeders.set(target, targetFeeders);
      };

      for (let round = 1; round <= shape.winnersRounds; round += 1) {
        const matchCount = shape.winnersMatchCounts[round - 1];
        for (let index = 0; index < matchCount; index += 1) {
          const targetRound = round === 1 ? 1 : 2 * round - 2;
          const targetIndex = resolveWinnersLoserTargetIndex(
            round,
            index,
            matchCount,
          );
          const slot = resolveLoserTargetSlot({
            sourceRoundNumber: round,
            sourceMatchOrder: index + 1,
          });
          addFeeder(
            `L${targetRound}-M${targetIndex + 1}`,
            slot,
            `W${round}-M${index + 1}`,
          );
        }
      }

      for (let round = 1; round < shape.losersRounds; round += 1) {
        const matchCount = shape.losersMatchCounts[round - 1];
        for (let index = 0; index < matchCount; index += 1) {
          const targetIndex = round % 2 !== 0 ? index : Math.floor(index / 2);
          const slot = resolveWinnerTargetSlot({
            sourceBranch: 'LOSERS',
            sourceRoundNumber: round,
            sourceMatchOrder: index + 1,
            targetBranch: 'LOSERS',
          });
          addFeeder(
            `L${round + 1}-M${targetIndex + 1}`,
            slot,
            `L${round}-M${index + 1}`,
          );
        }
      }

      for (let round = 1; round <= shape.losersRounds; round += 1) {
        for (let index = 0; index < shape.losersMatchCounts[round - 1]; index += 1) {
          expect(feeders.get(`L${round}-M${index + 1}`)?.size).toBe(2);
        }
      }

      const grandFinalSlots = new Set([
        resolveWinnerTargetSlot({
          sourceBranch: 'MAIN',
          sourceRoundNumber: shape.winnersRounds,
          sourceMatchOrder: 1,
          targetBranch: 'GRAND_FINALS',
        }),
        resolveWinnerTargetSlot({
          sourceBranch: 'LOSERS',
          sourceRoundNumber: shape.losersRounds,
          sourceMatchOrder: 1,
          targetBranch: 'GRAND_FINALS',
        }),
      ]);
      expect(grandFinalSlots).toEqual(
        new Set(['participant1Id', 'participant2Id']),
      );
    },
  );

  it.each([1, 3, 5])(
    'places every lower-bracket round %i winner into slot 1',
    (sourceRoundNumber) => {
      expect(
        resolveWinnerTargetSlot({
          sourceBranch: 'LOSERS',
          sourceRoundNumber,
          sourceMatchOrder: 2,
          targetBranch: 'LOSERS',
        }),
      ).toBe('participant1Id');
    },
  );

  it('pairs winners when a lower-bracket round collapses', () => {
    expect(resolveWinnerTargetSlot({ sourceBranch: 'LOSERS', sourceRoundNumber: 2, sourceMatchOrder: 1, targetBranch: 'LOSERS' })).toBe('participant1Id');
    expect(resolveWinnerTargetSlot({ sourceBranch: 'LOSERS', sourceRoundNumber: 2, sourceMatchOrder: 2, targetBranch: 'LOSERS' })).toBe('participant2Id');
  });

  it('keeps finalists on separate grand-final slots', () => {
    expect(resolveWinnerTargetSlot({ sourceBranch: 'MAIN', sourceRoundNumber: 4, sourceMatchOrder: 1, targetBranch: 'GRAND_FINALS' })).toBe('participant1Id');
    expect(resolveWinnerTargetSlot({ sourceBranch: 'LOSERS', sourceRoundNumber: 6, sourceMatchOrder: 1, targetBranch: 'GRAND_FINALS' })).toBe('participant2Id');
  });

  it('routes first-round losers by pair and later losers to slot 2', () => {
    expect(resolveLoserTargetSlot({ sourceRoundNumber: 1, sourceMatchOrder: 1 })).toBe('participant1Id');
    expect(resolveLoserTargetSlot({ sourceRoundNumber: 1, sourceMatchOrder: 2 })).toBe('participant2Id');
    expect(resolveLoserTargetSlot({ sourceRoundNumber: 2, sourceMatchOrder: 2 })).toBe('participant2Id');
  });

  it('crosses later winners-bracket losers into adjacent lower sections', () => {
    expect([0, 1, 2, 3].map((index) => resolveWinnersLoserTargetIndex(2, index, 4)))
      .toEqual([1, 0, 3, 2]);
    expect([0, 1].map((index) => resolveWinnersLoserTargetIndex(3, index, 2)))
      .toEqual([1, 0]);
    expect(resolveWinnersLoserTargetIndex(4, 0, 1)).toBe(0);
  });
});
