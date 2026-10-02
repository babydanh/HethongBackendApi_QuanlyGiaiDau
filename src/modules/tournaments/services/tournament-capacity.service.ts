import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { PG_CONNECTION } from '../../../database/database.module';
import type { AppDb, AppDbOrTx } from '../../../database/db.types';
import * as schema from '../../../database/schema';
import { and, count, eq, inArray } from 'drizzle-orm';
import {
  CAPACITY_RESERVING_TEAM_STATUSES,
  calculateOccupiedCapacity,
  calculateRequestedTeamSlots,
  type CapacityEntry,
} from '../utils/tournament-participant-status';
import {
  IMPORT_SOURCES,
  type ImportSource,
} from '../dto/import-participants.dto';

/** Capacity is always expressed in team slots; `maxParticipants` stays a team limit. */
export interface TournamentCapacitySnapshot {
  occupiedTeamSlots: number;
  occupiedMemberSlots: number;
  maxTeamSlots: number | null;
  isFull: boolean;
}

/** The subset a caller needs to decide whether a claim fits. */
export type DivisionCapacityLimit = Pick<
  TournamentCapacitySnapshot,
  'occupiedTeamSlots' | 'maxTeamSlots' | 'isFull'
>;

/** Batched occupancy keyed by division id or tournament id. */
export type CapacityByScopeId = Record<string, TournamentCapacitySnapshot>;

export interface CapacityOwnerContext {
  tournamentConfig?: unknown;
}

/**
 * Single source of truth for tournament/division occupancy.
 *
 * Doubles pairing divisions consume one team slot per two active roster
 * members, so a single unpaired member occupies half a team. Singles and team
 * sports keep one participant/team record per slot. Only capacity-reserving
 * statuses count; waitlisted and terminal rows release their seats.
 */

/**
 * Reject a capacity claim that would not fit `requestedTeamSlots`.
 *
 * Uncapped scopes never block, and a non-positive request consumes nothing
 * (an athlete appended to an already-counted team row must not re-claim that
 * row's slot).
 */
export function assertCapacityHasRoom(
  capacity: DivisionCapacityLimit,
  requestedTeamSlots: number,
): void {
  if (capacity.maxTeamSlots == null) return;
  if (!(requestedTeamSlots > 0)) return;

  if (capacity.occupiedTeamSlots + requestedTeamSlots > capacity.maxTeamSlots) {
    throw new BadRequestException('Nội dung thi đấu đã đầy.');
  }
}

/**
 * Reject a capacity claim that would not fit.
 *
 * Doubles/mixed doubles add `requestedMemberCount / 2` team slots; every other
 * unit adds one whole team for the new registration row.
 */
export function assertDivisionHasRoom(
  capacity: DivisionCapacityLimit,
  matchType: string | null | undefined,
  requestedMemberCount: number,
  context?: CapacityOwnerContext,
): void {
  assertCapacityHasRoom(
    capacity,
    calculateRequestedTeamSlots(matchType, requestedMemberCount, context),
  );
}

@Injectable()
export class TournamentCapacityService {
  constructor(@Inject(PG_CONNECTION) private readonly db: AppDb) {}

  async getDivisionCapacity(
    divisionId: string,
    options?: { executor?: AppDbOrTx },
  ): Promise<TournamentCapacitySnapshot> {
    return readDivisionCapacity(options?.executor ?? this.db, divisionId);
  }

  /** Batched occupancy for every division; avoids one read per division. */
  async getDivisionCapacities(
    tournamentId: string,
    options?: { executor?: AppDbOrTx },
  ): Promise<CapacityByScopeId> {
    return readDivisionCapacities(options?.executor ?? this.db, tournamentId);
  }

  async getTournamentCapacity(
    tournamentId: string,
    options?: { executor?: AppDbOrTx },
  ): Promise<TournamentCapacitySnapshot> {
    return readTournamentCapacity(options?.executor ?? this.db, tournamentId);
  }

  /** Batched occupancy for a page of tournaments; avoids one read per item. */
  async getTournamentCapacities(
    tournamentIds: readonly string[],
    options?: { executor?: AppDbOrTx },
  ): Promise<CapacityByScopeId> {
    return readTournamentCapacities(
      options?.executor ?? this.db,
      tournamentIds,
    );
  }
}

const EMPTY_CAPACITY: TournamentCapacitySnapshot = {
  occupiedTeamSlots: 0,
  occupiedMemberSlots: 0,
  maxTeamSlots: null,
  isFull: false,
};

/** A row that owns a capacity limit, plus the config that picks the unit. */
interface CapacityOwnerRow {
  id: string;
  tournamentId: string | null;
  matchType: string | null;
  maxParticipants: number | null;
  tournamentConfig: unknown;
}

/**
 * Serialize a capacity claim on the rows that own the limit.
 *
 * Two concurrent claims would otherwise both read the same free slot and both
 * write, overfilling the division. Lock order is always tournament -> division
 * and callers take these locks before any participant row, so two capacity
 * paths can never deadlock against each other.
 */
export async function lockCapacityOwner(
  executor: AppDbOrTx,
  scope: { tournamentId: string; divisionId?: string | null },
): Promise<void> {
  await executor
    .select({ id: schema.tournaments.id })
    .from(schema.tournaments)
    .where(eq(schema.tournaments.id, scope.tournamentId))
    .for('update')
    .limit(1);

  if (!scope.divisionId) return;

  await executor
    .select({ id: schema.tournamentDivisions.id })
    .from(schema.tournamentDivisions)
    .where(eq(schema.tournamentDivisions.id, scope.divisionId))
    .for('update')
    .limit(1);
}

async function selectDivisionOwners(
  executor: AppDbOrTx,
  scope: {
    divisionIds?: readonly string[];
    divisionId?: string;
    tournamentId?: string;
  },
): Promise<CapacityOwnerRow[]> {
  return await executor
    .select({
      id: schema.tournamentDivisions.id,
      tournamentId: schema.tournamentDivisions.tournamentId,
      matchType: schema.tournamentDivisions.matchType,
      maxParticipants: schema.tournamentDivisions.maxParticipants,
      tournamentConfig: schema.tournaments.tournamentConfig,
    })
    .from(schema.tournamentDivisions)
    .innerJoin(
      schema.tournaments,
      eq(schema.tournaments.id, schema.tournamentDivisions.tournamentId),
    )
    .where(
      scope.divisionIds !== undefined
        ? inArray(schema.tournamentDivisions.id, [...scope.divisionIds])
        : scope.divisionId
          ? eq(schema.tournamentDivisions.id, scope.divisionId)
          : eq(
              schema.tournamentDivisions.tournamentId,
              scope.tournamentId ?? '',
            ),
    );
}

/**
 * Division occupancy read inside an existing transaction or on the pool.
 *
 * Single and batch reads share {@link readCapacitiesForDivisionOwners} so a
 * division can never project one capacity here and another there.
 */
export async function readDivisionCapacity(
  executor: AppDbOrTx,
  divisionId: string,
): Promise<TournamentCapacitySnapshot> {
  const [division] = await selectDivisionOwners(executor, { divisionId });
  if (!division) return EMPTY_CAPACITY;

  const snapshots = await readCapacitiesForDivisionOwners(executor, [division]);
  return snapshots[divisionId] ?? EMPTY_CAPACITY;
}

/**
 * Occupancy for every division of a tournament in a fixed number of queries, so
 * a public projection never fans out into one capacity read per division.
 */
export async function readDivisionCapacities(
  executor: AppDbOrTx,
  tournamentId: string,
): Promise<CapacityByScopeId> {
  return readCapacitiesForDivisionOwners(
    executor,
    await selectDivisionOwners(executor, { tournamentId }),
  );
}

/**
 * Occupancy for an explicit set of divisions. Read models that already hold
 * division rows (catalog cards, community posts) use this so they never fan
 * out into one capacity read per division.
 */
export async function readCapacitiesForDivisions(
  executor: AppDbOrTx,
  divisionIds: readonly string[],
): Promise<CapacityByScopeId> {
  const ids = [...new Set(divisionIds.filter(Boolean))];
  if (ids.length === 0) return {};

  return readCapacitiesForDivisionOwners(
    executor,
    await selectDivisionOwners(executor, { divisionIds: ids }),
  );
}

async function readCapacitiesForDivisionOwners(
  executor: AppDbOrTx,
  divisions: readonly CapacityOwnerRow[],
): Promise<CapacityByScopeId> {
  const snapshots: CapacityByScopeId = {};
  for (const division of divisions) snapshots[division.id] = EMPTY_CAPACITY;
  if (divisions.length === 0) return snapshots;

  // A division that sets no limit of its own is governed by its parent
  // tournament, and that cap is spent across the whole tournament. Read the
  // governing parents in one batched pass, then pay for parent-wide occupancy
  // only for the parents that actually cap — never one read per division.
  const parentIds = [
    ...new Set(
      divisions
        .filter((division) => division.maxParticipants == null)
        .map((division) => division.tournamentId)
        .filter((tournamentId): tournamentId is string => Boolean(tournamentId)),
    ),
  ];
  const cappedParents = parentIds.length
    ? (await selectTournamentOwners(executor, parentIds)).filter(
        (tournament) => tournament.maxParticipants != null,
      )
    : [];
  const parentCapacities = cappedParents.length
    ? buildTournamentSnapshots(
        cappedParents,
        cappedParents.map((tournament) => tournament.id),
        await selectParticipantEntries(executor, {
          tournamentIds: cappedParents.map((tournament) => tournament.id),
        }),
      )
    : {};

  const inheritedSnapshot = (division: CapacityOwnerRow) =>
    division.maxParticipants != null || !division.tournamentId
      ? undefined
      : parentCapacities[division.tournamentId];
  const divisionOwned = divisions.filter(
    (division) => !inheritedSnapshot(division),
  );

  const entriesByDivision =
    divisionOwned.length > 0
      ? groupEntriesByScope(
          await selectParticipantEntries(executor, {
            divisionIds: divisionOwned.map((division) => division.id),
          }),
        )
      : {};

  for (const division of divisionOwned) {
    snapshots[division.id] = buildSnapshot(
      division,
      entriesByDivision[division.id] ?? [],
    );
  }

  // An inherited division adopts its parent's snapshot whole: the same limit
  // and the same parent-wide occupancy, so no projection can show a division
  // as open while the cap that actually governs it is already spent.
  for (const division of divisions) {
    const parent = inheritedSnapshot(division);
    if (parent) snapshots[division.id] = { ...parent };
  }

  return snapshots;
}

/** Tournament-wide occupancy, the limit owner for a division-less claim. */
export async function readTournamentCapacity(
  executor: AppDbOrTx,
  tournamentId: string,
): Promise<TournamentCapacitySnapshot> {
  const snapshots = await readTournamentCapacities(executor, [tournamentId]);
  return snapshots[tournamentId] ?? EMPTY_CAPACITY;
}

/**
 * The capacity that actually applies to a claim.
 *
 * A division-scoped claim reads its division's effective capacity, which
 * already inherits a parent cap that governs an uncapped division; a pair that
 * belongs to the tournament only is limited by the tournament itself.
 */
export async function readEffectiveCapacity(
  executor: AppDbOrTx,
  scope: { tournamentId: string; divisionId?: string | null },
): Promise<TournamentCapacitySnapshot> {
  if (!scope.divisionId) {
    return readTournamentCapacity(executor, scope.tournamentId);
  }

  return readDivisionCapacity(executor, scope.divisionId);
}

/** Tournament-wide occupancy for a page of tournaments in two queries. */
export async function readTournamentCapacities(
  executor: AppDbOrTx,
  tournamentIds: readonly string[],
): Promise<CapacityByScopeId> {
  const ids = [...new Set(tournamentIds.filter(Boolean))];
  if (ids.length === 0) return {};

  const tournaments = await selectTournamentOwners(executor, ids);
  return buildTournamentSnapshots(
    tournaments,
    ids,
    await selectParticipantEntries(executor, { tournamentIds: ids }),
  );
}

async function selectTournamentOwners(
  executor: AppDbOrTx,
  tournamentIds: readonly string[],
): Promise<CapacityOwnerRow[]> {
  return await executor
    .select({
      id: schema.tournaments.id,
      tournamentId: schema.tournaments.id,
      matchType: schema.tournaments.matchType,
      maxParticipants: schema.tournaments.maxParticipants,
      tournamentConfig: schema.tournaments.tournamentConfig,
    })
    .from(schema.tournaments)
    .where(inArray(schema.tournaments.id, [...tournamentIds]));
}

function buildTournamentSnapshots(
  tournaments: readonly CapacityOwnerRow[],
  tournamentIds: readonly string[],
  entries: readonly CapacityEntryRow[],
): CapacityByScopeId {
  const snapshots: CapacityByScopeId = {};
  const entriesByTournament = groupEntriesByScope(entries);

  for (const tournament of tournaments) {
    snapshots[tournament.id] = buildSnapshot(
      tournament,
      entriesByTournament[tournament.id] ?? [],
    );
  }

  for (const id of tournamentIds) {
    if (!snapshots[id]) snapshots[id] = EMPTY_CAPACITY;
  }

  return snapshots;
}

function groupEntriesByScope(
  entries: readonly CapacityEntryRow[],
): Record<string, CapacityEntry[]> {
  const byScope: Record<string, CapacityEntry[]> = {};
  for (const entry of entries) {
    const bucket = byScope[entry.scopeId];
    if (bucket) bucket.push(entry);
    else byScope[entry.scopeId] = [entry];
  }
  return byScope;
}

interface CapacityEntryRow extends CapacityEntry {
  scopeId: string;
}

async function selectParticipantEntries(
  executor: AppDbOrTx,
  scope: {
    divisionIds?: readonly string[];
    tournamentIds?: readonly string[];
  },
): Promise<CapacityEntryRow[]> {
  const ids = [...(scope.divisionIds ?? scope.tournamentIds ?? [])];
  const reservingRows = inArray(schema.tournamentParticipants.teamStatus, [
    ...CAPACITY_RESERVING_TEAM_STATUSES,
  ]);
  const entryColumns = {
    teamStatus: schema.tournamentParticipants.teamStatus,
    rosterMemberCount: count(schema.tournamentRosters.userId),
    customResponses: schema.tournamentParticipants.customResponses,
  };
  const participants = schema.tournamentParticipants;

  if (scope.divisionIds !== undefined) {
    const rows = await executor
      .select({
        scopeId: participants.tournamentDivisionId,
        ...entryColumns,
      })
      .from(participants)
      .leftJoin(
        schema.tournamentRosters,
        eq(schema.tournamentRosters.participantId, participants.id),
      )
      .where(
        and(inArray(participants.tournamentDivisionId, ids), reservingRows),
      )
      .groupBy(
        participants.id,
        participants.tournamentDivisionId,
        entryColumns.teamStatus,
        entryColumns.customResponses,
      );

    return rows.map((row) => toCapacityEntry(row.scopeId, row, null));
  }

  // A tournament-wide read spans divisions of different formats, so each row
  // has to carry its own; a division read already knows its format and never
  // joins. A row without a division keeps the tournament's format.
  const rows = await executor
    .select({
      scopeId: participants.tournamentId,
      ...entryColumns,
      divisionMatchType: schema.tournamentDivisions.matchType,
    })
    .from(participants)
    .leftJoin(
      schema.tournamentRosters,
      eq(schema.tournamentRosters.participantId, participants.id),
    )
    .leftJoin(
      schema.tournamentDivisions,
      eq(schema.tournamentDivisions.id, participants.tournamentDivisionId),
    )
    .where(and(inArray(participants.tournamentId, ids), reservingRows))
    .groupBy(
      participants.id,
      participants.tournamentId,
      entryColumns.teamStatus,
      entryColumns.customResponses,
      schema.tournamentDivisions.matchType,
    );

  return rows.map((row) =>
    toCapacityEntry(row.scopeId, row, row.divisionMatchType),
  );
}

function toCapacityEntry(
  scopeId: string | null,
  row: {
    teamStatus: string | null;
    rosterMemberCount: number;
    customResponses: unknown;
  },
  matchType: string | null | undefined,
): CapacityEntryRow {
  const rosterMemberCount = Number(row.rosterMemberCount ?? 0);
  return {
    scopeId: scopeId ?? '',
    teamStatus: row.teamStatus,
    rosterMemberCount,
    importedMemberCount: importedPairMemberCount(
      row.customResponses,
      rosterMemberCount,
    ),
    matchType: matchType ?? null,
  };
}

function buildSnapshot(
  owner: CapacityOwnerRow,
  entries: readonly CapacityEntry[],
): TournamentCapacitySnapshot {
  const occupied = calculateOccupiedCapacity(
    owner.matchType,
    entries,
    { tournamentConfig: owner.tournamentConfig },
  );
  const maxTeamSlots = owner.maxParticipants ?? null;

  return {
    occupiedTeamSlots: occupied.teamSlots,
    occupiedMemberSlots: occupied.memberSlots,
    maxTeamSlots,
    isFull: maxTeamSlots != null && occupied.teamSlots >= maxTeamSlots,
  };
}

/**
 * Imported doubles pairs can reference contacts with no linked account, so they
 * own no roster rows. Their validated import metadata still declares the
 * players that occupy the team.
 *
 * The marker matters: self-registered rows also carry a `customResponses`
 * payload (registration-form answers), and an unpaired leader must keep
 * consuming half a team there, not a whole one.
 */
function importedPairMemberCount(
  customResponses: unknown,
  rosterMemberCount: number,
): number {
  if (!customResponses || typeof customResponses !== 'object') return 0;

  const payload = customResponses as {
    importedFrom?: unknown;
    player2Name?: unknown;
  };
  if (
    !IMPORT_SOURCES.includes(payload.importedFrom as ImportSource)
  ) {
    return 0;
  }

  const player2Name = payload.player2Name;
  const declaredMemberCount =
    typeof player2Name === 'string' && player2Name.trim().length > 0 ? 2 : 1;

  return declaredMemberCount > rosterMemberCount ? declaredMemberCount : 0;
}
