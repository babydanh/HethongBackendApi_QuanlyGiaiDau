import { resolveFootballTeamConfig } from './football-team-config';
import { isDoublesMatchType } from './tournament-input-policy';

export type DoublesPairingMode = 'ORGANIZER' | 'SELF';
export type DoublesParticipantTransition =
  | {
      event: 'REGISTER';
      registrationMode: unknown;
      waitlisted: boolean;
      isLite?: boolean;
      pairingMode?: DoublesPairingMode;
      rosterCount?: number;
      hasPartnerInvite?: boolean;
    }
  | {
      event: 'APPROVE';
      registrationMode: unknown;
      isDoubles: boolean;
      rosterCount: number;
      isLite?: boolean;
      pairingMode?: DoublesPairingMode;
      hasPartnerInvite?: boolean;
    }
  | { event: 'PAIR' };

export type DoublesParticipantStatus =
  | 'WAITLISTED'
  | 'PENDING_APPROVAL'
  | 'PENDING_PARTNER'
  | 'COMPLETE';

export function resolveDoublesParticipantStatus(
  transition: DoublesParticipantTransition,
): DoublesParticipantStatus {
  switch (transition.event) {
    case 'REGISTER': {
      if (transition.waitlisted) return 'WAITLISTED';
      const pairingMode = transition.pairingMode ?? 'ORGANIZER';
      const rosterCount = transition.rosterCount ?? 1;
      const hasPartnerInvite = transition.hasPartnerInvite ?? false;

      if (transition.registrationMode === 'APPROVAL') {
        if (rosterCount >= 2) return 'PENDING_APPROVAL';
        if (pairingMode === 'ORGANIZER' || !hasPartnerInvite) {
          return 'PENDING_APPROVAL';
        }
      }
      return rosterCount >= 2 ? 'COMPLETE' : 'PENDING_PARTNER';
    }
    case 'APPROVE':
      return transition.registrationMode === 'APPROVAL' &&
        transition.isDoubles &&
        transition.rosterCount === 1
        ? 'PENDING_PARTNER'
        : 'COMPLETE';
    case 'PAIR':
      return 'COMPLETE';
  }
}

export type NonDoublesParticipantStatus =
  | 'WAITLISTED'
  | 'PENDING'
  | 'PENDING_APPROVAL'
  | 'COMPLETE';

export function resolveNonDoublesParticipantStatus(input: {
  registrationMode: unknown;
  waitlisted: boolean;
  incompleteRoster: boolean;
}): NonDoublesParticipantStatus {
  if (input.waitlisted) return 'WAITLISTED';
  if (input.incompleteRoster) return 'PENDING';
  return input.registrationMode === 'APPROVAL'
    ? 'PENDING_APPROVAL'
    : 'COMPLETE';
}
export function isDoublesParticipantPairable(
  teamStatus: string | null | undefined,
  teamInviteToken?: string | null,
): boolean {
  return teamStatus === 'PENDING_PARTNER' && !teamInviteToken;
}

export const CAPACITY_RESERVING_TEAM_STATUSES = [
  'PENDING',
  'PENDING_APPROVAL',
  'PENDING_PARTNER',
  'COMPLETE',
] as const;

const capacityReservingTeamStatuses = new Set<string>(
  CAPACITY_RESERVING_TEAM_STATUSES,
);

export interface CapacityEntry {
  teamStatus: string | null | undefined;
  rosterMemberCount: number;
  importedMemberCount?: number;
  /**
   * Format of the division this row belongs to. A tournament-wide read spans
   * divisions, so every row carries its own; a row with no division (or a
   * division-scoped read) leaves it unset and uses the scope's format.
   */
  matchType?: string | null;
}

function normalizedMemberCount(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value ?? 0)) : 0;
}

/**
 * Capacity unit of a division/tournament.
 *
 * `MEMBER` is the roster-weighted doubles pairing unit: every active roster
 * athlete holds half a team. `TEAM` is the legacy whole-row unit used by
 * singles and by team sports (a football squad of eleven is still one team
 * record, not five and a half teams).
 */
export type CapacityUnit = 'TEAM' | 'MEMBER';

export function resolveCapacityUnit(
  matchType: string | null | undefined,
  tournamentConfig?: unknown,
): CapacityUnit {
  if (!isDoublesMatchType(matchType)) return 'TEAM';
  return resolveFootballTeamConfig(tournamentConfig).isTeamSport
    ? 'TEAM'
    : 'MEMBER';
}

/**
 * Occupancy of a scope in both units the projections expose.
 *
 * `teamSlots` is what `maxParticipants` limits; `memberSlots` is the same
 * occupancy expressed as athletes, so a mixed-format scope never reports a
 * member count that contradicts the slot count it derived it from.
 */
export interface OccupiedCapacity {
  teamSlots: number;
  memberSlots: number;
}

/**
 * Resolve occupied slots from persisted registration rows.
 *
 * Doubles roster members consume half a team each; other formats remain
 * one participant/team row per capacity slot. Each row is weighed by the
 * format of its own division, so a singles athlete inside a doubles tournament
 * still owns a whole team; rows without a division use the scope's format.
 */
export function calculateOccupiedCapacity(
  matchType: string | null | undefined,
  entries: readonly CapacityEntry[],
  options?: { tournamentConfig?: unknown },
): OccupiedCapacity {
  let teamSlots = 0;
  let memberSlots = 0;

  for (const entry of entries) {
    if (!capacityReservingTeamStatuses.has(entry.teamStatus ?? '')) continue;

    const unit = resolveCapacityUnit(
      entry.matchType ?? matchType,
      options?.tournamentConfig,
    );
    if (unit === 'TEAM') {
      teamSlots += 1;
      memberSlots += 1;
      continue;
    }

    const members = Math.max(
      normalizedMemberCount(entry.rosterMemberCount),
      normalizedMemberCount(entry.importedMemberCount),
    );
    teamSlots += members / 2;
    memberSlots += members;
  }

  return { teamSlots, memberSlots };
}

/** Team slots occupied by the given rows. */
export function calculateOccupiedTeamSlots(
  matchType: string | null | undefined,
  entries: readonly CapacityEntry[],
  options?: { tournamentConfig?: unknown },
): number {
  return calculateOccupiedCapacity(matchType, entries, options).teamSlots;
}

/**
 * Team slots a single new claim will consume.
 *
 * Doubles pairing adds one member slot per requested athlete (so a single
 * unpaired athlete takes half a team); every other unit adds one whole team
 * for the new registration row. A non-positive request adds nothing, which is
 * how paths that only append athletes to an already-counted team row (a
 * football squad joining through an open invite link) stay out of the check.
 */
export function calculateRequestedTeamSlots(
  matchType: string | null | undefined,
  requestedMemberCount: number,
  options?: { tournamentConfig?: unknown },
): number {
  const requestedMembers = normalizedMemberCount(requestedMemberCount);
  if (requestedMembers <= 0) return 0;

  const unit = resolveCapacityUnit(matchType, options?.tournamentConfig);
  return unit === 'MEMBER' ? requestedMembers / 2 : 1;
}

/**
 * Whether appending another athlete to a participant row changes occupancy.
 *
 * A doubles pairing row grows from half a team to a whole one, so the partner
 * must clear capacity. A team-sport row is already counted as one whole team,
 * so another squad member adds nothing and must never be rejected by capacity.
 */
export function isRosterWeightedCapacity(
  matchType: string | null | undefined,
  tournamentConfig?: unknown,
): boolean {
  return resolveCapacityUnit(matchType, tournamentConfig) === 'MEMBER';
}
