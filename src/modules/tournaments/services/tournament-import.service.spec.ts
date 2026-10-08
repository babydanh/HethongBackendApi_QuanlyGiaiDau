import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { validate } from 'class-validator';
import { NotificationsService } from '../../notifications/notifications.service';
import { ImportParticipantsDto } from '../dto/import-participants.dto';
import { RosterImportDto } from '../dto/roster-import.dto';
import {
  AddAthleteCandidateDto,
  AddAthleteDirectDto,
  ListAddAthleteCandidatesQueryDto,
} from '../dto/add-athlete.dto';
import { TournamentsRepository } from '../tournaments.repository';
import { TournamentAccessService } from './tournament-access.service';
import { TournamentImportService } from './tournament-import.service';

describe('TournamentImportService', () => {
  const repositoryMock = {
    findById: jest.fn(),
    importParticipants: jest.fn(),
  };
  const accessMock = { isManager: jest.fn() };
  const repository = repositoryMock as unknown as TournamentsRepository;
  const access = accessMock as unknown as TournamentAccessService;
  const importer = new TournamentImportService(
    repository,
    access,
    null as unknown as NotificationsService,
    { sendConfirmationRequest: jest.fn().mockResolvedValue(false) } as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects imports after registration is locked before writing participants', async () => {
    repositoryMock.findById.mockResolvedValue({
      id: 'tournament-1',
      status: 'REGISTRATION_CLOSED',
      isRegistrationLocked: true,
    });
    accessMock.isManager.mockResolvedValue(true);
    const dto = Object.assign(new ImportParticipantsDto(), {
      participants: [],
      notifyLinkedAccounts: false,
    });

    await expect(
      importer.importParticipantsFromForm(
        'tournament-1',
        'organizer-1',
        [],
        dto,
        jest.fn(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repositoryMock.importParticipants).not.toHaveBeenCalled();
  });
});

describe('TournamentImportService import contracts', () => {
  const repositoryMock = {
    findById: jest.fn(),
    importParticipants: jest.fn(),
    importRosterRows: jest.fn(),
    listAddAthleteCandidates: jest.fn(),
    addAthleteCandidate: jest.fn(),
    addDirectAthlete: jest.fn(),
    findBracket: jest.fn(),
    hasStartedMatch: jest.fn(),
  };
  const accessMock = { isManager: jest.fn() };
  const mailMock = { sendMail: jest.fn() };
  const notificationsMock = { sendNotification: jest.fn() };
  const consentMock = { sendConfirmationRequest: jest.fn().mockResolvedValue(false) };
  const openTournament = {
    id: 'tournament-1',
    communityId: 'community-1',
    name: 'Giải mở rộng',
    status: 'REGISTRATION_OPEN',
    isRegistrationLocked: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    repositoryMock.findById.mockResolvedValue(openTournament);
    accessMock.isManager.mockResolvedValue(true);
    mailMock.sendMail.mockResolvedValue(undefined);
    notificationsMock.sendNotification.mockResolvedValue(undefined);
    repositoryMock.findBracket.mockResolvedValue({ stages: [] });
    repositoryMock.hasStartedMatch.mockResolvedValue(false);
  });

  const buildImporter = () =>
    new TournamentImportService(
      repositoryMock as unknown as TournamentsRepository,
      accessMock as unknown as TournamentAccessService,
      notificationsMock as unknown as NotificationsService,
      consentMock as never,
      mailMock as never,
    );

  type AddAthleteBroadcast = (
    tournamentId: string,
    payload: {
      participantId?: string;
      divisionId?: string | null;
      action: string;
    },
  ) => void;
  type AddAthleteService = {
    listAddAthleteCandidates(
      tournamentId: string,
      userId: string,
      systemRoles: string[],
      dto: ListAddAthleteCandidatesQueryDto,
    ): Promise<unknown>;
    addAthleteCandidate(
      tournamentId: string,
      userId: string,
      systemRoles: string[],
      dto: AddAthleteCandidateDto,
      broadcast: AddAthleteBroadcast,
    ): Promise<unknown>;
    addDirectAthlete(
      tournamentId: string,
      userId: string,
      systemRoles: string[],
      dto: AddAthleteDirectDto,
      broadcast: AddAthleteBroadcast,
    ): Promise<unknown>;
  };
  const buildAddAthleteService = () =>
    buildImporter() as unknown as AddAthleteService;
  it('keeps the legacy invitation-email behaviour and emailsSent counter', async () => {
    repositoryMock.importParticipants.mockResolvedValue({
      importedCount: 1,
      unregisteredEmails: [
        { email: 'guest@example.test', name: 'Khách', teamName: 'Khách' },
      ],
      linkedAccountNotifications: [],
    });

    const dto = Object.assign(new ImportParticipantsDto(), {
      participants: [{ teamName: 'Khách', player1Name: 'Khách' }],
      sendInvitationEmail: true,
    });

    const result = await buildImporter().importParticipantsFromForm(
      'tournament-1',
      'organizer-1',
      [],
      dto,
      jest.fn(),
    );

    expect(repositoryMock.importParticipants).toHaveBeenCalled();
    expect(repositoryMock.importRosterRows).not.toHaveBeenCalled();
    expect(mailMock.sendMail).toHaveBeenCalledWith(
      'guest@example.test',
      expect.stringContaining(openTournament.name),
      expect.stringContaining('register'),
    );
    expect(result.emailsSent).toBe(1);
  });

  it('commits declared roster rows through the strict repository path', async () => {
    repositoryMock.importRosterRows.mockResolvedValue({
      importedCount: 2,
      linkedAccountNotifications: [],
    });

    const dto = Object.assign(new RosterImportDto(), {
      participants: [
        {
          teamName: 'VĐV 1',
          player1Name: 'VĐV 1',
          player1Email: 'a@example.test',
          source: 'EXCEL',
        },
      ],
    });
    const broadcast = jest.fn();

    const result = await buildImporter().importRosterFromForm(
      'tournament-1',
      'organizer-1',
      [],
      dto,
      broadcast,
    );

    expect(repositoryMock.importRosterRows).toHaveBeenCalledWith(
      'tournament-1',
      'organizer-1',
      dto.participants,
      undefined,
    );
    expect(repositoryMock.importParticipants).not.toHaveBeenCalled();
    expect(mailMock.sendMail).not.toHaveBeenCalled();
    expect(result.importedCount).toBe(2);
    expect(broadcast).toHaveBeenCalledWith('tournament-1', {
      divisionId: undefined,
      action: 'IMPORT_PARTICIPANTS',
    });
  });

  it('never invites unregistered contacts from the strict roster path', async () => {
    repositoryMock.importRosterRows.mockResolvedValue({
      importedCount: 1,
      unregisteredEmails: [
        { email: 'guest@example.test', name: 'Khách', teamName: 'Khách' },
      ],
      linkedAccountNotifications: [],
    });

    const result = await buildImporter().importRosterFromForm(
      'tournament-1',
      'organizer-1',
      [],
      Object.assign(new RosterImportDto(), {
        participants: [
          {
            teamName: 'Khách',
            player1Name: 'Khách',
            player1Email: 'guest@example.test',
            source: 'EXCEL',
          },
        ],
        sendInvitationEmail: true,
      } as never),
      jest.fn(),
    );

    expect(mailMock.sendMail).not.toHaveBeenCalled();
    expect(result).not.toHaveProperty('emailsSent');
  });

  const closedTournament = {
    ...openTournament,
    status: 'REGISTRATION_CLOSED',
    isRegistrationLocked: true,
  };
  const rosterCommitDto = Object.assign(new RosterImportDto(), {
    participants: [
      {
        teamName: 'VĐV 1',
        player1Name: 'VĐV 1',
        player1Email: 'a@example.test',
        source: 'EXCEL' as const,
      },
    ],
  });

  it('commits roster rows while registration is closed and no bracket exists yet', async () => {
    repositoryMock.findById.mockResolvedValue(closedTournament);
    repositoryMock.importRosterRows.mockResolvedValue({
      importedCount: 1,
      linkedAccountNotifications: [],
    });

    const result = await buildImporter().importRosterFromForm(
      'tournament-1',
      'organizer-1',
      [],
      rosterCommitDto,
      jest.fn(),
    );

    expect(repositoryMock.importRosterRows).toHaveBeenCalled();
    expect(result.importedCount).toBe(1);
  });

  it('rejects the roster commit once a bracket stage exists', async () => {
    repositoryMock.findById.mockResolvedValue(closedTournament);
    repositoryMock.findBracket.mockResolvedValue({
      stages: [{ id: 'stage-1' }],
    });

    await expect(
      buildImporter().importRosterFromForm(
        'tournament-1',
        'organizer-1',
        [],
        rosterCommitDto,
        jest.fn(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(repositoryMock.importRosterRows).not.toHaveBeenCalled();
  });

  it('re-checks at commit time and rejects when a match started after a preview', async () => {
    repositoryMock.findById.mockResolvedValue(closedTournament);
    repositoryMock.findBracket.mockResolvedValue({ stages: [] });
    // A concurrent bracket generation plus kickoff lands between preview and commit.
    repositoryMock.hasStartedMatch.mockResolvedValue(true);

    await expect(
      buildImporter().importRosterFromForm(
        'tournament-1',
        'organizer-1',
        [],
        rosterCommitDto,
        jest.fn(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(repositoryMock.hasStartedMatch).toHaveBeenCalledWith('tournament-1');
    expect(repositoryMock.importRosterRows).not.toHaveBeenCalled();
  });

  it('rejects the roster commit for a completed tournament even without a bracket', async () => {
    repositoryMock.findById.mockResolvedValue({
      ...openTournament,
      status: 'COMPLETED',
    });

    await expect(
      buildImporter().importRosterFromForm(
        'tournament-1',
        'organizer-1',
        [],
        rosterCommitDto,
        jest.fn(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(repositoryMock.importRosterRows).not.toHaveBeenCalled();
  });

  it('keeps the manager authorization gate for the roster commit', async () => {
    repositoryMock.findById.mockResolvedValue(closedTournament);
    accessMock.isManager.mockResolvedValue(false);

    await expect(
      buildImporter().importRosterFromForm(
        'tournament-1',
        'organizer-1',
        [],
        rosterCommitDto,
        jest.fn(),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(repositoryMock.importRosterRows).not.toHaveBeenCalled();
  });

  it('keeps the legacy import and manual add-athlete paths blocked once registration is closed', async () => {
    repositoryMock.findById.mockResolvedValue(closedTournament);

    await expect(
      buildImporter().importParticipantsFromForm(
        'tournament-1',
        'organizer-1',
        [],
        Object.assign(new ImportParticipantsDto(), { participants: [] }),
        jest.fn(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      buildAddAthleteService().addAthleteCandidate(
        'tournament-1',
        'organizer-1',
        [],
        Object.assign(new AddAthleteCandidateDto(), {
          source: 'FRIENDS',
          userId: 'athlete-1',
        }),
        jest.fn(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      buildAddAthleteService().addDirectAthlete(
        'tournament-1',
        'organizer-1',
        [],
        Object.assign(new AddAthleteDirectDto(), { name: 'Khách' }),
        jest.fn(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(repositoryMock.importParticipants).not.toHaveBeenCalled();
    expect(repositoryMock.addAthleteCandidate).not.toHaveBeenCalled();
    expect(repositoryMock.addDirectAthlete).not.toHaveBeenCalled();
    expect(repositoryMock.importRosterRows).not.toHaveBeenCalled();
  });
describe('TournamentImportService organizer add-athlete flow', () => {
  const candidateDto = Object.assign(new AddAthleteCandidateDto(), {
    source: 'FRIENDS',
    userId: 'athlete-1',
    tournamentDivisionId: 'division-1',
  });
  it('requires an explicit football role when adding to an existing team', async () => {
    const candidate = Object.assign(new AddAthleteCandidateDto(), {
      source: 'FRIENDS',
      userId: '00000000-0000-4000-8000-000000000001',
      participantId: '00000000-0000-4000-8000-000000000002',
    });

    const errors = await validate(candidate);

    expect(errors.some((error) => error.property === 'role')).toBe(true);
  });

  it('rejects candidate listing for non-managers before querying relationships', async () => {
    accessMock.isManager.mockResolvedValue(false);

    await expect(
      buildAddAthleteService().listAddAthleteCandidates(
        'tournament-1',
        'organizer-1',
        [],
        Object.assign(new ListAddAthleteCandidatesQueryDto(), {
          source: 'FRIENDS',
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(repositoryMock.listAddAthleteCandidates).not.toHaveBeenCalled();
  });

  it('requests consent only after committing a linked candidate', async () => {
    const events: string[] = [];
    repositoryMock.addAthleteCandidate.mockImplementation(async () => {
      events.push('committed');
      return {
        participant: {
          participantId: 'participant-1',
          teamName: 'VĐV',
          teamStatus: 'PENDING_APPROVAL',
        },
        linkedAccountNotifications: [
          {
            rosterId: 'roster-1',
            userId: 'athlete-1',
            status: 'PENDING_APPROVAL',
          },
        ],
      };
    });
    consentMock.sendConfirmationRequest.mockImplementation(async () => {
      events.push('consent-requested');
      return false;
    });
    const broadcast = jest.fn();

    const result = await buildAddAthleteService().addAthleteCandidate(
      'tournament-1',
      'organizer-1',
      [],
      candidateDto,
      broadcast,
    );

    expect(events).toEqual(['committed', 'consent-requested']);
    expect(consentMock.sendConfirmationRequest).toHaveBeenCalledWith(
      'roster-1',
    );
    expect(result).toEqual({
      participantId: 'participant-1',
      teamName: 'VĐV',
      teamStatus: 'PENDING_APPROVAL',
    });
    expect(broadcast).toHaveBeenCalledWith('tournament-1', {
      divisionId: 'division-1',
      action: 'IMPORT_PARTICIPANTS',
    });
  });
  it('notifies only a newly appended football member and preserves the roster event', async () => {
    repositoryMock.findById.mockResolvedValue({
      ...openTournament,
      tournamentConfig: { teamSize: 5 },
    });
    const footballCandidate = Object.assign(new AddAthleteCandidateDto(), {
      source: 'CLUB',
      userId: 'athlete-1',
      participantId: 'participant-1',
      role: 'RESERVE',
    });
    repositoryMock.addAthleteCandidate.mockResolvedValue({
      participant: {
        participantId: 'participant-1',
        teamName: 'Đội A',
        teamStatus: 'PENDING_APPROVAL',
        rosterRole: 'RESERVE',
      },
      linkedAccountNotifications: [
        {
          rosterId: 'roster-2',
          userId: 'athlete-1',
          status: 'PENDING_APPROVAL',
          divisionId: 'division-1',
        },
      ],
      footballRosterConfirmation: {
        participantId: 'participant-1',
        divisionId: 'division-1',
        userId: 'athlete-1',
      },
    });
    const broadcast = jest.fn();

    const result = await buildAddAthleteService().addAthleteCandidate(
      'tournament-1',
      'organizer-1',
      [],
      footballCandidate,
      broadcast,
    );

    expect(consentMock.sendConfirmationRequest).toHaveBeenCalledWith('roster-2');
    expect(notificationsMock.sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        receiverId: 'athlete-1',
        title: 'Xác nhận đội hình thi đấu',
      }),
    );
    expect(broadcast).toHaveBeenCalledWith('tournament-1', {
      participantId: 'participant-1',
      divisionId: 'division-1',
      action: 'ROSTER_UPDATED',
    });
    expect(result).toEqual({
      participantId: 'participant-1',
      teamName: 'Đội A',
      teamStatus: 'PENDING_APPROVAL',
      rosterRole: 'RESERVE',
    });
  });

  it('rejects direct entry in a configured team tournament', async () => {
    repositoryMock.findById.mockResolvedValue({
      ...openTournament,
      tournamentConfig: { teamSize: 5 },
    });

    await expect(
      buildAddAthleteService().addDirectAthlete(
        'tournament-1',
        'organizer-1',
        [],
        Object.assign(new AddAthleteDirectDto(), { name: 'Khách' }),
        jest.fn(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(repositoryMock.addDirectAthlete).not.toHaveBeenCalled();
  });

  it('does not request ranking consent for a direct entry', async () => {
    repositoryMock.addDirectAthlete.mockResolvedValue({
      participant: {
        participantId: 'participant-direct',
        teamName: 'Khách',
        teamStatus: 'PENDING_APPROVAL',
      },
    });
    const broadcast = jest.fn();

    const result = await buildAddAthleteService().addDirectAthlete(
      'tournament-1',
      'organizer-1',
      [],
      Object.assign(new AddAthleteDirectDto(), {
        name: 'Khách',
        tournamentDivisionId: 'division-1',
      }),
      broadcast,
    );

    expect(result).toEqual({
      participantId: 'participant-direct',
      teamName: 'Khách',
      teamStatus: 'PENDING_APPROVAL',
    });
    expect(consentMock.sendConfirmationRequest).not.toHaveBeenCalled();
    expect(broadcast).toHaveBeenCalledWith('tournament-1', {
      divisionId: 'division-1',
      action: 'IMPORT_PARTICIPANTS',
    });
  });
});
});
