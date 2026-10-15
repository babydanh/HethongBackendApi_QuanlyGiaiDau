import { ForbiddenException } from '@nestjs/common';
import { PaymentStatus } from '../../../common/constants/enums';
import type { RedisService } from '../../../providers/redis/redis.service';
import { TournamentsRepository } from '../tournaments.repository';
import { TournamentAccessService } from './tournament-access.service';
import { TournamentDiscoveryService } from './tournament-discovery.service';

describe('TournamentDiscoveryService', () => {
  const tournament = () => ({
    id: 'tournament-1',
    createdBy: 'owner-1',
    status: 'PUBLISHED',
    visibility: 'PUBLIC',
    tournamentType: 'PUBLIC',
    inviteCode: 'private-code',
    tournamentConfig: {},
  });
  const repositoryMock = {
    findById: jest.fn(),
    findParticipantById: jest.fn(),
    findParticipants: jest.fn(),
    findCommunityMember: jest.fn(),
    isUserParticipant: jest.fn(),
  };
  const repository = repositoryMock as unknown as TournamentsRepository;
  const access = {
    isManager: jest.fn(),
  } as unknown as TournamentAccessService;
  const discovery = new TournamentDiscoveryService(
    repository,
    null as unknown as RedisService,
    access,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    repositoryMock.findById.mockImplementation(async () => tournament());
    repositoryMock.findParticipantById.mockResolvedValue(null);
    repositoryMock.findCommunityMember.mockResolvedValue(null);
    repositoryMock.isUserParticipant.mockResolvedValue(false);
    access.isManager = jest.fn().mockResolvedValue(false);
  });

  it('hides invite codes from non-owner public viewers and preserves them for owners', async () => {
    const publicView = await discovery.findOne('tournament-1', 'viewer-1');
    const ownerView = await discovery.findOne('tournament-1', 'owner-1');

    expect(publicView.inviteCode).toBeNull();
    expect(ownerView.inviteCode).toBe('private-code');
  });

  it('rejects private tournament access without a valid invite', async () => {
    repositoryMock.findById.mockImplementation(async () => ({
      ...tournament(),
      visibility: 'PRIVATE',
    }));

    await expect(
      discovery.findOne('tournament-1', 'viewer-1', 'wrong-code'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  describe('findParticipantsForOrganizer isPaid', () => {
    const FEE = '150000.00';
    const row = (overrides: Record<string, unknown>) => ({
      id: 'p1',
      teamName: 'Doi Linh Hoat',
      isPaid: false,
      entryFeeAtRegistration: FEE,
      organizerWaivedFee: false,
      payment: null,
      ...overrides,
    });

    it.each([
      [
        'a free registration (fee 0.00) stored as unpaid',
        { entryFeeAtRegistration: '0.00' },
        true,
      ],
      [
        'a fee the organizer waived',
        { organizerWaivedFee: true },
        true,
      ],
      ['a paid registration with no payment', {}, false],
      [
        'a paid registration with a pending payment',
        { payment: { status: PaymentStatus.PENDING } },
        false,
      ],
      [
        'a paid registration with a completed payment',
        { payment: { status: PaymentStatus.COMPLETED } },
        true,
      ],
      ['a paid registration already flagged paid', { isPaid: true }, true],
      [
        'a row that does not report its fee',
        { entryFeeAtRegistration: undefined },
        false,
      ],
    ])('reports %s', async (_label, overrides, expected) => {
      access.isManager = jest.fn().mockResolvedValue(true);
      repositoryMock.findParticipants.mockResolvedValue([row(overrides)]);

      const [participant] = await discovery.findParticipantsForOrganizer(
        'tournament-1',
        undefined,
        'owner-1',
      );

      expect(participant.isPaid).toBe(expected);
    });
  });
});
