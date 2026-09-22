import { reflowScheduleStart } from './reflow-schedule';

const minute = 60 * 1000;
const interval = (start: number, duration: number) => ({
  startMs: start * minute,
  endMs: (start + duration) * minute,
});

describe('reflowScheduleStart', () => {
  it('keeps an assignment when the requested slot is free', () => {
    expect(
      reflowScheduleStart({
        requestedStartMs: 8 * 60 * minute,
        durationMs: 15 * minute,
        courtIntervals: [interval(8 * 60 + 15, 15)],
        participantIntervals: [],
      }),
    ).toBe(8 * 60 * minute);
  });

  it('moves a real court overlap to the next 15-minute slot', () => {
    expect(
      reflowScheduleStart({
        requestedStartMs: 8 * 60 * minute,
        durationMs: 15 * minute,
        courtIntervals: [interval(8 * 60, 15)],
        participantIntervals: [],
      }),
    ).toBe(8 * 60 * minute + 15 * minute);
  });

  it('respects a legacy 30-minute blocker instead of rejecting the write', () => {
    expect(
      reflowScheduleStart({
        requestedStartMs: 8 * 60 * minute,
        durationMs: 15 * minute,
        courtIntervals: [interval(8 * 60, 30)],
        participantIntervals: [],
      }),
    ).toBe(8 * 60 * minute + 30 * minute);
  });

  it('moves for participant conflicts even when the court is different', () => {
    expect(
      reflowScheduleStart({
        requestedStartMs: 8 * 60 * minute,
        durationMs: 15 * minute,
        courtIntervals: [],
        participantIntervals: [interval(8 * 60, 15)],
      }),
    ).toBe(8 * 60 * minute + 15 * minute);
  });

  it('walks through consecutive blockers in one reflow', () => {
    expect(
      reflowScheduleStart({
        requestedStartMs: 8 * 60 * minute,
        durationMs: 15 * minute,
        courtIntervals: [interval(8 * 60, 15), interval(8 * 60 + 15, 15)],
        participantIntervals: [],
      }),
    ).toBe(8 * 60 * minute + 30 * minute);
  });
});
