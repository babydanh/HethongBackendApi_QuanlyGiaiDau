import { BadRequestException } from '@nestjs/common';
import { NotificationsService } from '../../notifications/notifications.service';
import { ImportParticipantsDto } from '../dto/import-participants.dto';
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
      sendInvitationEmail: false,
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
