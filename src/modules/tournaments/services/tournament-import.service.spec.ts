import { BadRequestException } from '@nestjs/common';
import { NotificationsService } from '../../notifications/notifications.service';
import { ImportParticipantsDto } from '../dto/import-participants.dto';
import { RosterImportDto } from '../dto/roster-import.dto';
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
  };
  const accessMock = { isManager: jest.fn() };
  const mailMock = { sendMail: jest.fn() };
  const openTournament = {
    id: 'tournament-1',
    name: 'Giải mở rộng',
    status: 'REGISTRATION_OPEN',
    isRegistrationLocked: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    repositoryMock.findById.mockResolvedValue(openTournament);
    accessMock.isManager.mockResolvedValue(true);
    mailMock.sendMail.mockResolvedValue(undefined);
  });

  const buildImporter = () =>
    new TournamentImportService(
      repositoryMock as unknown as TournamentsRepository,
      accessMock as unknown as TournamentAccessService,
      null as unknown as NotificationsService,
      mailMock as never,
    );

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
});
