import {
  allocateRoundRobinGroups,
  buildRoundRobinSchedule,
  resolveConfiguredGroups,
  resolveRoundRobinGroupCount,
  resolveRoundsToPlay,
} from './round-robin-config';

describe('round-robin config compatibility', () => {
  it('treats roundsToPlay as legs and prefers the more specific config', () => {
    expect(resolveRoundsToPlay(
      { groupsConfig: { roundsToPlay: 2 } },
      { roundRobinLegs: 1 },
    )).toBe(2);
  });

  it('keeps configured groups and their BO rules separate', () => {
    const groups = resolveConfiguredGroups({
      groupsConfig: {
        groups: [
          { name: 'Alpha', participantIds: ['p1', 'p2'], bestOf: 1 },
          { name: 'Beta', participantIds: ['p3', 'p4'], roundConfig: { bestOf: 5 } },
        ],
      },
    });

    expect(groups).toEqual([
      { name: 'Alpha', participantIds: ['p1', 'p2'], roundConfig: { bestOf: 1 } },
      { name: 'Beta', participantIds: ['p3', 'p4'], roundConfig: { bestOf: 5 } },
    ]);
  });

  it('preserves configured participant assignments while filling remaining slots', () => {
    const participants = ['p1', 'p2', 'p3', 'p4'].map((id) => ({ id }));
    const configured = resolveConfiguredGroups({
      groupsConfig: { groups: [
        { name: 'A', participantIds: ['p1'] },
        { name: 'B', participantIds: ['p3'] },
      ] },
    });

    const groups = allocateRoundRobinGroups(participants, 2, configured, 2);
    expect(groups.map((group) => group.map(({ id }) => id))).toEqual([
      ['p1', 'p2'],
      ['p3', 'p4'],
    ]);
  });

  it('keeps exactly two configured groups and accepts five legs', () => {
    const config = {
      groupsConfig: {
        numGroups: 2,
        teamsPerGroup: 4,
        roundsToPlay: 5,
        groups: [
          { name: 'Alpha', participantIds: ['p1', 'p2'] },
          { name: 'Beta', participantIds: ['p3', 'p4'] },
        ],
      },
    };
    const configured = resolveConfiguredGroups(config);
    const participants = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'].map((id) => ({ id }));

    const groups = allocateRoundRobinGroups(participants, configured.length, configured, 4);

    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group.map(({ id }) => id))).toEqual([
      ['p1', 'p2', 'p5'],
      ['p3', 'p4', 'p6'],
    ]);
    expect(resolveRoundsToPlay(config)).toBe(5);
  });

  it('keeps declared groups when assignment metadata is partial', () => {
    const configured = resolveConfiguredGroups({
      groupsConfig: {
        numGroups: 2,
        groups: [{ name: 'Alpha', participantIds: ['p1', 'p2'] }],
      },
    });

    expect(resolveRoundRobinGroupCount(
      { numGroups: 2 },
      configured,
      4,
      8,
    )).toBe(2);
    expect(allocateRoundRobinGroups(
      ['p1', 'p2', 'p3', 'p4', 'p5'].map((id) => ({ id })),
      2,
      configured,
      8,
    ).map((group) => group.map(({ id }) => id))).toEqual([
      ['p1', 'p2', 'p3'],
      ['p4', 'p5'],
    ]);
  });

  it.each([1, 2, 3, 4, 5])('creates %s complete legs without cross-group pairings', (legs) => {
    const groupA = new Set(['a1', 'a2', 'a3', 'a4']);
    const groupB = new Set(['b1', 'b2', 'b3', 'b4']);
    const schedule = [
      ...buildRoundRobinSchedule([...groupA], legs),
      ...buildRoundRobinSchedule([...groupB], legs),
    ];

    expect(schedule).toHaveLength(2 * 4 * 3 / 2 * legs);
    expect(new Set(schedule.map((match) => match.leg))).toEqual(new Set(
      Array.from({ length: legs }, (_, index) => index + 1),
    ));
    expect(schedule.every((match) =>
      (groupA.has(match.participant1Id) && groupA.has(match.participant2Id)) ||
      (groupB.has(match.participant1Id) && groupB.has(match.participant2Id)),
    )).toBe(true);
  });

  it('does not silently truncate or default invalid leg counts', () => {
    expect(resolveRoundsToPlay({ groupsConfig: { roundsToPlay: 2.5 } })).toBe(2.5);
    expect(resolveRoundsToPlay({ groupsConfig: { roundsToPlay: '5' } })).toBe(5);
    expect(() => buildRoundRobinSchedule(['p1', 'p2'], 0)).toThrow();
    expect(() => buildRoundRobinSchedule(['p1', 'p2'], 6)).toThrow();
    expect(() => buildRoundRobinSchedule(['p1', 'p2'], 1.5)).toThrow();
  });
});
