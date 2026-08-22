import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { SponsorsService } from './sponsors.service';
import type { SponsorsRepository } from './sponsors.repository';

const tournament = {
  id: 'tournament-1',
  createdBy: 'owner-1',
  communityId: null,
  visibility: 'PUBLIC',
  status: 'PUBLISHED',
  deletedAt: null,
};

const owner: JwtPayload = {
  sub: 'owner-1',
  email: 'owner@example.com',
  role: 'USER',
  roles: [],
};

const baseSponsor = {
  id: 'sponsor-1',
  tournamentId: 'tournament-1',
  displayName: 'Ace Sports',
  tier: 'GOLD',
  logoUrl: 'https://cdn.example.com/ace.png',
  websiteUrl: 'https://ace.example.com/',
  shortDescription: null,
  displayOrder: 0,
  status: 'DRAFT',
  isPublic: true,
  startAt: null,
  endAt: null,
  createdBy: 'owner-1',
  updatedBy: 'owner-1',
  createdAt: new Date('2026-08-22T00:00:00.000Z'),
  updatedAt: new Date('2026-08-22T00:00:00.000Z'),
  archivedAt: null,
  deletedAt: null,
};

type RepositoryMock = {
  findTournamentForAccess: jest.Mock;
  listForPublic: jest.Mock;
  listForOrganizer: jest.Mock;
  isCoOrganizer: jest.Mock;
  findCommunityMember: jest.Mock;
  findById: jest.Mock;
  create: jest.Mock;
  update: jest.Mock;
  archive: jest.Mock;
};

const makeService = () => {
  const repository: RepositoryMock = {
    findTournamentForAccess: jest.fn(),
    listForPublic: jest.fn(),
    listForOrganizer: jest.fn(),
    isCoOrganizer: jest.fn().mockResolvedValue(false),
    findCommunityMember: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    archive: jest.fn(),
  };
  return {
    repository,
    service: new SponsorsService(repository as unknown as SponsorsRepository),
  };
};

describe('SponsorsService', () => {
  it('does not expose sponsors for a private or draft tournament', async () => {
    const { service, repository } = makeService();
    repository.findTournamentForAccess.mockResolvedValue({
      ...tournament,
      visibility: 'PRIVATE',
    });

    await expect(service.listPublic('tournament-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repository.listForPublic).not.toHaveBeenCalled();
  });

  it('allows the tournament owner to create a normalized sponsor', async () => {
    const { service, repository } = makeService();
    repository.findTournamentForAccess.mockResolvedValue(tournament);
    repository.create.mockResolvedValue(baseSponsor);

    const result = await service.create('tournament-1', owner, {
      displayName: '  Ace Sports  ',
      tier: 'GOLD',
      logoUrl: 'https://cdn.example.com/ace.png',
      websiteUrl: 'https://ace.example.com',
      displayOrder: 0,
      status: 'PUBLISHED',
      isPublic: true,
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        displayName: 'Ace Sports',
        websiteUrl: 'https://ace.example.com/',
        status: 'PUBLISHED',
        createdBy: 'owner-1',
      }),
    );
    expect(result).toEqual(expect.objectContaining({ tournamentId: 'tournament-1' }));
  });

  it('rejects a non-manager before reading or mutating a sponsor', async () => {
    const { service, repository } = makeService();
    repository.findTournamentForAccess.mockResolvedValue(tournament);
    const stranger = { ...owner, sub: 'stranger-1' };

    await expect(service.listForOrganizer('tournament-1', stranger)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(repository.listForOrganizer).not.toHaveBeenCalled();
  });

  it('prevents cross-tournament sponsor updates through the composite lookup', async () => {
    const { service, repository } = makeService();
    repository.findTournamentForAccess.mockResolvedValue(tournament);
    repository.findById.mockResolvedValue(null);

    await expect(
      service.update('tournament-1', 'sponsor-from-another-tournament', owner, {
        displayName: 'Changed',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('rejects a partial update that reverses the stored display window', async () => {
    const { service, repository } = makeService();
    repository.findTournamentForAccess.mockResolvedValue(tournament);
    repository.findById.mockResolvedValue({
      ...baseSponsor,
      startAt: new Date('2026-09-02T00:00:00.000Z'),
      endAt: new Date('2026-09-10T00:00:00.000Z'),
    });

    await expect(
      service.update('tournament-1', 'sponsor-1', owner, {
        endAt: '2026-09-01T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('rejects unsafe URLs and reversed display windows', async () => {
    const { service, repository } = makeService();
    repository.findTournamentForAccess.mockResolvedValue(tournament);

    await expect(
      service.create('tournament-1', owner, {
        displayName: 'Unsafe',
        tier: 'GOLD',
        logoUrl: 'data:image/png;base64,not-public-url',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.create('tournament-1', owner, {
        displayName: 'Reversed',
        tier: 'GOLD',
        logoUrl: 'https://cdn.example.com/logo.png',
        startAt: '2026-09-02T00:00:00.000Z',
        endAt: '2026-09-01T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

export {};

