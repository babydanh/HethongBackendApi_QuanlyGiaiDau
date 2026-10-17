import 'reflect-metadata';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/constants/enums';
import { TournamentsController } from './tournaments.controller';

const getRoles = (handler: string): UserRole[] =>
  Reflect.getMetadata(
    ROLES_KEY,
    (TournamentsController.prototype as unknown as Record<string, unknown>)[
      handler
    ] as object,
  ) as UserRole[];

// Handlers the tournament management page calls on a club-owned tournament.
// Club OWNER/MODERATOR is a PLAYER; the real per-tournament check is
// TournamentAccessService.isManager inside the service.
const CLUB_MANAGEABLE_HANDLERS = [
  'createDivision',
  'updateDivision',
  'updateDivisionConfig',
  'removeDivision',
  'update',
  'cancelDivisionBracket',
  'publish',
  'updateSeeds',
  'lock',
  'regenerateInvite',
  'reopenRegistration',
  'addGalleryImage',
  'removeGalleryImage',
  'addReferee',
  'revokeRefereeInvite',
  'updateStage',
  'previewRosterImportBatch',
  'importRosterBatch',
  'listAddAthleteCandidates',
  'searchAddAthleteCandidates',
  'addAthleteCandidate',
  'addDirectAthlete',
  'addAthletePairs',
  'updateParticipantStatus',
  'setParticipantFeePaid',
  'setParticipantNote',
  'setParticipantPresent',
  'lockParticipantRoster',
  'unlockParticipantRoster',
  'assignReservedSlot',
  'autoSeed',
  'advanceStandings',
  'addStaffMember',
  'removeStaffMember',
] as const;

// Handlers outside the management page scope: must keep ORGANIZER/ADMIN only.
const ORGANIZER_ONLY_HANDLERS = [
  'createParent',
  'removeParent',
  'cancelTournament',
  'createPlayoffMatch',
  'finalizeStage',
  'updateGroup',
  'previewRosterImport',
  'importParticipants',
  'importRoster',
  'confirmRoster',
] as const;

// Series update: a club OWNER/MODERATOR passes the role gate and is admitted
// by TournamentLifecycleService.updateParent only for a series whose child
// tournament they manage.
const PARENT_CLUB_MANAGEABLE_HANDLERS = ['updateParent'] as const;

describe('TournamentsController manager-scoped route roles', () => {
  it('covers exactly the 34 club-manageable handlers', () => {
    expect(CLUB_MANAGEABLE_HANDLERS).toHaveLength(34);
    expect(new Set(CLUB_MANAGEABLE_HANDLERS).size).toBe(34);
  });

  it.each([...CLUB_MANAGEABLE_HANDLERS, ...PARENT_CLUB_MANAGEABLE_HANDLERS])(
    '%s lets PLAYER through the role gate while keeping ORGANIZER and ADMIN',
    (handler) => {
      const roles = getRoles(handler);
      expect(roles).toEqual(
        expect.arrayContaining([
          UserRole.PLAYER,
          UserRole.ORGANIZER,
          UserRole.ADMIN,
        ]),
      );
    },
  );

  it.each(ORGANIZER_ONLY_HANDLERS)(
    '%s keeps ORGANIZER/ADMIN only and does not admit PLAYER',
    (handler) => {
      const roles = getRoles(handler);
      expect(roles).toEqual(
        expect.arrayContaining([UserRole.ORGANIZER, UserRole.ADMIN]),
      );
      expect(roles).not.toContain(UserRole.PLAYER);
    },
  );

  it('keeps referee reads open to PLAYER and division reads without a role gate', () => {
    expect(getRoles('findReferees')).toContain(UserRole.PLAYER);
    expect(getRoles('findDivisions')).toBeUndefined();
  });
});
