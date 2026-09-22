export type ScheduleInterval = {
  startMs: number;
  endMs: number;
};

export type ReflowScheduleInput = {
  requestedStartMs: number;
  durationMs: number;
  courtIntervals: ScheduleInterval[];
  participantIntervals: ScheduleInterval[];
  gridMs?: number;
  maxAttempts?: number;
};

/**
 * Keep a requested match on the grid, moving it to the first free slot when
 * its court or one of its participants is already occupied.
 *
 * Returns null only when the bounded search cannot find a free slot. Existing
 * intervals are read-only; the caller persists the returned start time.
 */
export function reflowScheduleStart({
  requestedStartMs,
  durationMs,
  courtIntervals,
  participantIntervals,
  gridMs = 15 * 60 * 1000,
  maxAttempts = 192,
}: ReflowScheduleInput): number | null {
  const snapToGrid = (timestamp: number) =>
    Math.ceil(timestamp / gridMs) * gridMs;
  const findConflict = (startMs: number) => {
    const endMs = startMs + durationMs;
    return {
      court: courtIntervals.find(
        (interval) => startMs < interval.endMs && endMs > interval.startMs,
      ),
      participant: participantIntervals.find(
        (interval) => startMs < interval.endMs && endMs > interval.startMs,
      ),
    };
  };

  let currentStartMs = requestedStartMs;
  let attempts = 0;
  while (attempts < maxAttempts) {
    const conflict = findConflict(currentStartMs);
    if (!conflict.court && !conflict.participant) return currentStartMs;

    currentStartMs = snapToGrid(
      Math.max(
        conflict.court?.endMs || 0,
        conflict.participant?.endMs || 0,
        currentStartMs + gridMs,
      ),
    );
    attempts += 1;
  }

  return findConflict(currentStartMs).court ||
    findConflict(currentStartMs).participant
    ? null
    : currentStartMs;
}
