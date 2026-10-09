import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { SocialSessionsService } from './social-sessions.service';
import { SocialSessionsRepository } from './social-sessions.repository';
import { ChatService } from '../chat/chat.service';
import { RegionsService } from '../regions/regions.service';
import { VenuesRepository } from '../venues/venues.repository';

function makeRepositoryMock(): jest.Mocked<SocialSessionsRepository> {
  return {
    findCategoryBySlug: jest.fn(),
    findCommunityById: jest.fn(),
    findMember: jest.fn(),
    findUserById: jest.fn(),
    findVenueById: jest.fn(),
    findAvailableCourt: jest.fn(),
    findSessionByIdempotencyKey: jest.fn(),
    findSessionById: jest.fn(),
    findSessionIdByShortCode: jest.fn(),
    listByDate: jest.fn(),
    listNearby: jest.fn(),
    listByCommunity: jest.fn(),
    isParticipant: jest.fn(),
    findParticipant: jest.fn(),
    listJoinRequests: jest.fn(),
    setJoinRequestStatus: jest.fn(),
    closeExpiredSessions: jest.fn(),
    listParticipants: jest.fn(),
    createWithHost: jest.fn(),
    requestToJoin: jest.fn(),
    approveJoinRequest: jest.fn(),
    joinOrAddParticipant: jest.fn(),
    addGuestParticipant: jest.fn(),
    addParticipantsBatch: jest.fn(),
    removeParticipant: jest.fn(),
    updateSession: jest.fn(),
    softDelete: jest.fn(),
    cancelSession: jest.fn(),
    hardDelete: jest.fn(),
    recentSessionsByHost: jest.fn(),
    getDb: jest.fn(),
  } as unknown as jest.Mocked<SocialSessionsRepository>;
}

const regionsStub = {
  getCentroid: jest.fn(),
  resolveByPoint: jest.fn().mockResolvedValue(null),
  validateCodes: jest.fn().mockResolvedValue({ provinceCode: null, wardCode: null }),
} as unknown as RegionsService;

function makeVenuesRepositoryMock() {
  return {
    create: jest.fn(),
    findOrCreateForSocial: jest.fn(),
  } as unknown as jest.Mocked<VenuesRepository>;
}


const CATEGORY_ID = '11111111-1111-4111-8111-111111111111';
const SESSION_ID = '22222222-2222-4222-8222-222222222222';
const HOST_ID = '33333333-3333-4333-8333-333333333333';
const MEMBER_ID = '44444444-4444-4444-8444-444444444444';
const COMMUNITY_ID = '55555555-5555-4555-8555-555555555555';

function baseSession(overrides = {}) {
  return {
    id: SESSION_ID,
    shortCode: 'abc12345678',
    communityId: COMMUNITY_ID,
    hostUserId: HOST_ID,
    categoryId: CATEGORY_ID,
    title: 'Pickleball Giao hữu',
    description: null,
    playFormat: 'Giao lưu',
    playDate: '2026-09-17',
    startAt: new Date('2026-09-17T14:45:00+07:00'),
    durationMinutes: 120,
    venueName: '22 Cộng Hòa',
    venueAddress: '22 Cộng Hòa, Tân Bình',
    latitude: null,
    longitude: null,
    venueGeolocation: null,
    provinceCode: null,
    wardCode: null,
    venueId: null,
    courtId: null,
    genderRequirement: 'ANY',
    creationIdempotencyKey: null,
    creationFingerprint: null,
    maxSlots: 8,
    currentSlots: 1,
    feePerSlot: 50000,
    levelRequirement: 'ALL',
    visibility: 'PUBLIC',
    contactPhone: null,
    zaloGroupUrl: null,
    status: 'OPEN',
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

function baseCreateDto(overrides = {}) {
  return {
    sport: 'pickleball' as const,
    title: 'Pickleball Giao hữu',
    startAt: '2026-09-17T14:45:00+07:00',
    latitude: 10.7769,
    longitude: 106.7009,
    venueName: '22 Cộng Hòa',
    venueAddress: '22 Cộng Hòa, Tân Bình',
    ...overrides,
  };
}

describe('SocialSessionsService', () => {
  let service: SocialSessionsService;
  let repository: jest.Mocked<SocialSessionsRepository>;
  let venuesRepository: jest.Mocked<VenuesRepository>;

  beforeEach(() => {
    repository = makeRepositoryMock();
    venuesRepository = makeVenuesRepositoryMock();
    service = new SocialSessionsService(repository, undefined, regionsStub, venuesRepository);
    repository.findCategoryBySlug.mockResolvedValue({
      id: CATEGORY_ID,
      slug: 'pickleball',
    });
    repository.closeExpiredSessions.mockResolvedValue([]);
    repository.isParticipant.mockResolvedValue(false);
  });

  describe('nearby', () => {
    it('returns metres and uses page-based pagination', async () => {
      const first = baseSession({ id: SESSION_ID });
      repository.listNearby.mockResolvedValue({
        items: [
          { session: first, distanceM: 125.5, sport: 'pickleball', sportName: 'Pickleball' },
        ],
        total: 2,
      } as never);
      const result = await service.nearby({ lat: 10.7769, lng: 106.7009, radius: 10000, limit: 1 });
      expect(result.items[0].distance_m).toBe(125.5);
      expect(result).toMatchObject({
        meta: { page: 1, limit: 1, total: 2 },
        nextCursor: null,
      });
      await service.nearby({ lat: 10.7769, lng: 106.7009, radius: 10000, limit: 1, page: 2 });
      expect(repository.listNearby).toHaveBeenLastCalledWith(expect.objectContaining({
        page: 2,
        limit: 1,
      }));
      await expect(service.nearby({ lat: 10, lng: 106.7009, radius: 10000, limit: 1, cursor: 'retired' }))
        .rejects.toMatchObject({ response: expect.objectContaining({ code: 'NEARBY_CURSOR_RETIRED' }) });
    });
  });

  describe('create', () => {
    it('từ chối CLUB_ONLY khi không gắn Club', async () => {
      await expect(
        service.create(
          { id: HOST_ID },
          baseCreateDto({ visibility: 'CLUB_ONLY' }),
        ),
      ).rejects.toMatchObject({
        response: { code: 'CLUB_ONLY_REQUIRES_COMMUNITY' },
      });
    });

    it('từ chối tạo kèo CLUB_ONLY khi caller không phải member', async () => {
      repository.findCommunityById.mockResolvedValue({
        id: COMMUNITY_ID,
        status: 'ACTIVE',
      });
      repository.findMember.mockResolvedValue(null as never);
      await expect(
        service.create(
          { id: HOST_ID },
          baseCreateDto({ communityId: COMMUNITY_ID, visibility: 'CLUB_ONLY' }),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('tạo kèo PUBLIC thành công + gắn HOST', async () => {
      const session = baseSession({ communityId: null, visibility: 'PUBLIC' });
      repository.createWithHost.mockResolvedValue({
        ok: true,
        session,
        replayed: false,
      });
      repository.findSessionById.mockResolvedValue({
        session,
        communityName: null,
        communityLogoUrl: null,
        categorySlug: 'pickleball',
        categoryName: 'Pickleball',
      });
      repository.listParticipants.mockResolvedValue([]);
      const result = await service.create({ id: HOST_ID }, baseCreateDto());
      expect(repository.createWithHost).toHaveBeenCalled();
      expect(result).toMatchObject({ id: SESSION_ID, isHost: true });
    });
    it('accepts any active sport category slug, including football', async () => {
      repository.findCategoryBySlug.mockResolvedValueOnce({
        id: CATEGORY_ID,
        slug: 'football',
      });
      const session = baseSession({
        communityId: null,
        visibility: 'PUBLIC',
        categoryId: CATEGORY_ID,
      });
      repository.createWithHost.mockResolvedValue({
        ok: true,
        session,
        replayed: false,
      });
      repository.findSessionById.mockResolvedValue({
        session,
        communityName: null,
        communityLogoUrl: null,
        categorySlug: 'football',
        categoryName: 'Bóng đá',
      });
      repository.listParticipants.mockResolvedValue([]);

      const result = await service.create(
        { id: HOST_ID },
        baseCreateDto({ sport: 'football' }),
      );

      expect(repository.findCategoryBySlug).toHaveBeenCalledWith('football');
      expect(result).toMatchObject({ id: SESSION_ID, isHost: true });
    });

    it('rejects a sport without an active category before persisting', async () => {
      repository.findCategoryBySlug.mockResolvedValueOnce(null);

      await expect(
        service.create(
          { id: HOST_ID },
          baseCreateDto({ sport: 'inactive-sport' }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(repository.findCategoryBySlug).toHaveBeenCalledWith(
        'inactive-sport',
      );
      expect(repository.createWithHost).not.toHaveBeenCalled();
    });

    it('replays a matching idempotency key and rejects a changed payload', async () => {
      const session = baseSession({ communityId: null, visibility: 'PUBLIC' });
      repository.findSessionByIdempotencyKey.mockResolvedValueOnce(
        null as never,
      );
      repository.createWithHost.mockResolvedValue({
        ok: true,
        session,
        replayed: false,
      });
      repository.findSessionById.mockResolvedValue({
        session,
        communityName: null,
        communityLogoUrl: null,
        categorySlug: 'pickleball',
        categoryName: 'Pickleball',
      });
      repository.listParticipants.mockResolvedValue([]);

      await service.create(
        { id: HOST_ID },
        baseCreateDto(),
        'client-request-1',
      );
      const [createdValues] = repository.createWithHost.mock.calls[0];
      repository.findSessionByIdempotencyKey.mockResolvedValue({
        ...session,
        creationIdempotencyKey: 'client-request-1',
        creationFingerprint: createdValues.creationFingerprint,
      } as never);

      await service.create(
        { id: HOST_ID },
        baseCreateDto(),
        'client-request-1',
      );
      expect(repository.createWithHost).toHaveBeenCalledTimes(1);
      await expect(
        service.create(
          { id: HOST_ID },
          baseCreateDto({ title: 'Different game' }),
          'client-request-1',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('replays before re-reading venue and court metadata', async () => {
      const venueId = '66666666-6666-4666-8666-666666666666';
      const courtId = '77777777-7777-4777-8777-777777777777';
      const session = baseSession({ communityId: null, visibility: 'PUBLIC' });
      repository.findVenueById.mockResolvedValue({
        id: venueId,
        name: 'Directory venue',
        locationAddress: 'Directory address',
        latitude: 10.7769,
        longitude: 106.7009,
      });
      repository.findAvailableCourt.mockResolvedValue({
        id: courtId,
        venueId,
        courtName: 'Court 1',
        status: 'AVAILABLE',
      });
      repository.createWithHost.mockResolvedValue({
        ok: true,
        session,
        replayed: false,
      });
      repository.findSessionById.mockResolvedValue({
        session,
        communityName: null,
        communityLogoUrl: null,
        categorySlug: 'pickleball',
        categoryName: 'Pickleball',
      });
      repository.listParticipants.mockResolvedValue([]);
      repository.findSessionByIdempotencyKey
        .mockResolvedValueOnce(null as never)
        .mockImplementationOnce(
          async () =>
            ({
              ...session,
              creationFingerprint:
                repository.createWithHost.mock.calls[0][0].creationFingerprint,
            }) as never,
        );

      const request = baseCreateDto({ venueId, courtId });
      await service.create({ id: HOST_ID }, request, 'create-key');

      repository.findVenueById.mockRejectedValue(new Error('venue changed'));
      repository.findAvailableCourt.mockRejectedValue(
        new Error('court changed'),
      );
      await service.create({ id: HOST_ID }, request, 'create-key');

      expect(repository.createWithHost).toHaveBeenCalledTimes(1);
      expect(repository.findVenueById).toHaveBeenCalledTimes(1);
      expect(repository.findAvailableCourt).toHaveBeenCalledTimes(1);
    });

    it('persists authoritative venue and court details from selected IDs', async () => {
      const venueId = '66666666-6666-4666-8666-666666666666';
      const courtId = '77777777-7777-4777-8777-777777777777';
      repository.findVenueById.mockResolvedValue({
        id: venueId,
        name: 'Directory venue',
        locationAddress: 'Directory address',
        latitude: 10.7769,
        longitude: 106.7009,
      });
      repository.findAvailableCourt.mockResolvedValue({
        id: courtId,
        venueId,
        courtName: 'Court 1',
        status: 'AVAILABLE',
      });
      repository.createWithHost.mockResolvedValue({
        ok: true,
        session: baseSession({ communityId: null, visibility: 'PUBLIC' }),
        replayed: false,
      });
      repository.findSessionById.mockResolvedValue({
        session: baseSession({ communityId: null, visibility: 'PUBLIC' }),
        communityName: null,
        communityLogoUrl: null,
        categorySlug: 'pickleball',
        categoryName: 'Pickleball',
      });
      repository.listParticipants.mockResolvedValue([]);

      await service.create(
        { id: HOST_ID },
        baseCreateDto({
          venueId,
          courtId,
          venueName: 'Forged name',
          venueAddress: 'Forged address',
        }),
      );

      expect(repository.createWithHost.mock.calls[0][0]).toEqual(
        expect.objectContaining({
          venueId,
          courtId,
          venueName: 'Directory venue',
          venueAddress: 'Directory address',
        }),
        HOST_ID,
      );
    });
  });

  describe('update', () => {
    it('chặn non-manager (không phải host, không phải OWNER/MODERATOR)', async () => {
      repository.findSessionById.mockResolvedValue({
        session: baseSession(),
        communityName: 'SB Club',
        communityLogoUrl: null,
        categorySlug: 'pickleball',
        categoryName: 'Pickleball',
      });
      repository.findMember.mockResolvedValue({
        role: 'MEMBER',
        status: 'JOINED',
      });
      await expect(
        service.update({ id: MEMBER_ID }, SESSION_ID, { title: 'Đổi tên' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('từ chối maxSlots nhỏ hơn currentSlots', async () => {
      repository.findSessionById.mockResolvedValue({
        session: baseSession({ currentSlots: 5 }),
        communityName: 'SB Club',
        communityLogoUrl: null,
        categorySlug: 'pickleball',
        categoryName: 'Pickleball',
      });
      await expect(
        service.update({ id: HOST_ID }, SESSION_ID, { maxSlots: 4 }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'MAX_SLOTS_BELOW_CURRENT' }),
      });
    });

    it('host được sửa (qua assertManager nhánh host)', async () => {
      const session = baseSession();
      repository.findSessionById.mockResolvedValue({
        session,
        communityName: null,
        communityLogoUrl: null,
        categorySlug: 'pickleball',
        categoryName: 'Pickleball',
      });
      repository.updateSession.mockResolvedValue(session);
      repository.listParticipants.mockResolvedValue([]);
      const result = await service.update({ id: HOST_ID }, SESSION_ID, {
        title: 'Tên mới',
      });
      expect(repository.updateSession).toHaveBeenCalledWith(
        SESSION_ID,
        expect.objectContaining({ title: 'Tên mới' }),
      );
      expect(result).toBeDefined();
    });

    describe('đổi địa điểm', () => {
      // startAt ở tương lai để `refreshStatusIfExpired` không tự đóng kèo.
      const hostedSession = (overrides = {}) =>
        baseSession({
          venueId: 'venue-old',
          courtId: null,
          playDate: '2099-01-01',
          startAt: new Date('2099-01-01T09:00:00+07:00'),
          ...overrides,
        });

      beforeEach(() => {
        repository.findSessionById.mockResolvedValue({
          session: hostedSession(),
          communityName: null,
          communityLogoUrl: null,
          categorySlug: 'pickleball',
          categoryName: 'Pickleball',
        });
        repository.listParticipants.mockResolvedValue([]);
        const tx = {};
        repository.getDb.mockReturnValue({
          transaction: (cb: (t: unknown) => unknown) => cb(tx),
        } as never);
        repository.updateSession.mockImplementation((_id, patch) =>
          Promise.resolve(hostedSession({ ...patch })),
        );
      });

      it('ghim mới thì tái dùng venue qua findOrCreateForSocial, không tạo bản sao', async () => {
        venuesRepository.findOrCreateForSocial.mockResolvedValue({
          id: 'venue-reused',
        } as never);

        await service.update({ id: HOST_ID }, SESSION_ID, {
          newVenue: {
            name: 'Sân Mới',
            locationAddress: '909 Đường Nguyễn Trãi, Q.1',
            latitude: 10.7769,
            longitude: 106.7009,
          },
        });

        expect(venuesRepository.findOrCreateForSocial).toHaveBeenCalledWith(
          HOST_ID,
          expect.objectContaining({ name: 'Sân Mới' }),
          expect.anything(),
          expect.objectContaining({ provinceCode: null, wardCode: null }),
        );
        // `create` giữ nguyên hành vi 409 cho luồng tạo mới.
        expect(venuesRepository.create).not.toHaveBeenCalled();
        expect(repository.updateSession).toHaveBeenCalledWith(
          SESSION_ID,
          expect.objectContaining({
            venueId: 'venue-reused',
            venueName: 'Sân Mới',
            venueAddress: '909 Đường Nguyễn Trãi, Q.1',
            courtId: null,
          }),
          expect.anything(),
        );
      });

      it('ghim trùng bán kính mà tên lệch thì vẫn 409 để host chọn lại venue', async () => {
        venuesRepository.findOrCreateForSocial.mockResolvedValue({
          duplicateCandidates: [{ id: 'venue-nearby', name: 'Sân Khác' }],
        } as never);

        await expect(
          service.update({ id: HOST_ID }, SESSION_ID, {
            newVenue: {
              name: 'Sân Mới',
              locationAddress: '909 Đường Nguyễn Trãi, Q.1',
              latitude: 10.7769,
              longitude: 106.7009,
            },
          }),
        ).rejects.toBeInstanceOf(ConflictException);
      });

      it('đường legacy chỉ gửi toạ độ và pin dịch chuyển thì xoá venueId/courtId cũ', async () => {
        repository.findSessionById.mockResolvedValue({
          session: hostedSession({ latitude: 10.7769, longitude: 106.7009 }),
          communityName: null,
          communityLogoUrl: null,
          categorySlug: 'pickleball',
          categoryName: 'Pickleball',
        });

        await service.update({ id: HOST_ID }, SESSION_ID, {
          latitude: 11.0,
          longitude: 107.0,
          venueName: 'Chỗ mới',
          venueAddress: 'Địa chỉ mới',
        });

        expect(repository.updateSession).toHaveBeenCalledWith(
          SESSION_ID,
          expect.objectContaining({
            latitude: 11.0,
            longitude: 107.0,
            venueId: null,
            courtId: null,
          }),
        );
      });

      it('đường legacy giữ nguyên toạ độ thì không đụng venueId', async () => {
        repository.findSessionById.mockResolvedValue({
          session: hostedSession({ latitude: 10.7769, longitude: 106.7009 }),
          communityName: null,
          communityLogoUrl: null,
          categorySlug: 'pickleball',
          categoryName: 'Pickleball',
        });

        await service.update({ id: HOST_ID }, SESSION_ID, {
          latitude: 10.7769,
          longitude: 106.7009,
        });

        const patch = repository.updateSession.mock.calls[0][1] as Record<string, unknown>;
        expect(patch.latitude).toBe(10.7769);
        expect(patch).not.toHaveProperty('venueId');
        expect(patch).not.toHaveProperty('courtId');
      });
    });
  });

  describe('join requests', () => {
    it('creates an unreserved request and returns its current state', async () => {
      repository.findSessionById.mockResolvedValue({
        session: baseSession({ communityId: null, visibility: 'PUBLIC' }),
        communityName: null,
        communityLogoUrl: null,
        categorySlug: 'pickleball',
        categoryName: 'Pickleball',
      });
      repository.requestToJoin.mockResolvedValue({
        ok: true,
        participant: { id: 'request-id', status: 'REQUESTED' } as never,
        replayed: false,
      });

      await expect(
        service.requestToJoin({ id: MEMBER_ID }, SESSION_ID, 2),
      ).resolves.toMatchObject({
        status: 'REQUESTED',
        replayed: false,
      });
      expect(repository.requestToJoin).toHaveBeenCalledWith(
        SESSION_ID,
        MEMBER_ID,
        2,
      );
    });

    it('restricts pending-request lists to the session host, not admins or club managers', async () => {
      repository.findSessionById.mockResolvedValue({
        session: baseSession(),
        communityName: 'SB Club',
        communityLogoUrl: null,
        categorySlug: 'pickleball',
        categoryName: 'Pickleball',
      });

      await expect(
        service.listJoinRequests(
          { id: MEMBER_ID, roles: ['ADMIN'] },
          SESSION_ID,
          {},
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(repository.listJoinRequests).not.toHaveBeenCalled();
    });
    it('allows only the host to approve pending requests', async () => {
      const row = {
        session: baseSession({ hostUserId: HOST_ID }),
        communityName: null,
        communityLogoUrl: null,
        categorySlug: 'pickleball',
        categoryName: 'Pickleball',
      };
      repository.findSessionById.mockResolvedValue(row);
      repository.approveJoinRequest.mockResolvedValue({
        ok: true,
        participant: { id: 'request-id', status: 'JOINED' },
        currentSlots: 3,
        status: 'OPEN',
      } as never);

      await expect(
        service.approveJoinRequest({ id: HOST_ID }, SESSION_ID, 'request-id'),
      ).resolves.toMatchObject({ currentSlots: 3, status: 'OPEN' });
      await expect(
        service.approveJoinRequest({ id: MEMBER_ID }, SESSION_ID, 'request-id'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(repository.approveJoinRequest).toHaveBeenCalledTimes(1);
    });

    it('lets the host reject only a pending request', async () => {
      repository.findSessionById.mockResolvedValue({
        session: baseSession({ hostUserId: HOST_ID }),
        communityName: null,
        communityLogoUrl: null,
        categorySlug: 'pickleball',
        categoryName: 'Pickleball',
      });
      repository.setJoinRequestStatus.mockResolvedValue({
        id: 'request-id',
        status: 'REJECTED',
      } as never);

      await expect(
        service.rejectJoinRequest({ id: HOST_ID }, SESSION_ID, 'request-id'),
      ).resolves.toMatchObject({ status: 'REJECTED' });
      expect(repository.setJoinRequestStatus).toHaveBeenCalledWith(
        SESSION_ID,
        'request-id',
        'REJECTED',
      );
    });

    it('lets a requester withdraw only their own pending request', async () => {
      repository.findSessionById.mockResolvedValue({
        session: baseSession(),
        communityName: null,
        communityLogoUrl: null,
        categorySlug: 'pickleball',
        categoryName: 'Pickleball',
      });
      repository.findParticipant.mockResolvedValue({
        id: 'request-id',
        status: 'REQUESTED',
      } as never);
      repository.setJoinRequestStatus.mockResolvedValue({
        id: 'request-id',
        status: 'CANCELLED',
      } as never);

      await expect(
        service.withdrawJoinRequest({ id: MEMBER_ID }, SESSION_ID),
      ).resolves.toMatchObject({ status: 'CANCELLED' });
      expect(repository.findParticipant).toHaveBeenCalledWith(
        SESSION_ID,
        MEMBER_ID,
      );
      expect(repository.setJoinRequestStatus).toHaveBeenCalledWith(
        SESSION_ID,
        'request-id',
        'CANCELLED',
      );

      repository.findParticipant.mockResolvedValue(null as never);
      await expect(
        service.withdrawJoinRequest({ id: HOST_ID }, SESSION_ID),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'REQUEST_NOT_PENDING' }),
      });
    });
  });
  describe('join', () => {
    it('chặn non-member với kèo CLUB_ONLY (NOT_CLUB_MEMBER)', async () => {
      repository.findSessionById.mockResolvedValue({
        session: baseSession({ visibility: 'CLUB_ONLY' }),
        communityName: 'SB Club',
        communityLogoUrl: null,
        categorySlug: 'pickleball',
        categoryName: 'Pickleball',
      });
      repository.findMember.mockResolvedValue(null as never);
      await expect(
        service.join({ id: MEMBER_ID }, SESSION_ID, {}),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(repository.joinOrAddParticipant).not.toHaveBeenCalled();
    });

    it('map SESSION_FULL thành ConflictException', async () => {
      repository.findSessionById.mockResolvedValue({
        session: baseSession({ visibility: 'PUBLIC', communityId: null }),
        communityName: null,
        communityLogoUrl: null,
        categorySlug: 'pickleball',
        categoryName: 'Pickleball',
      });
      repository.joinOrAddParticipant.mockResolvedValue({
        ok: false,
        code: 'SESSION_FULL',
      });
      await expect(
        service.join({ id: MEMBER_ID }, SESSION_ID, {}),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('404 khi session không tồn tại', async () => {
      repository.findSessionById.mockResolvedValue(null as never);
      await expect(
        service.join({ id: MEMBER_ID }, SESSION_ID, {}),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('addParticipant', () => {
    it('404 khi target user không tồn tại', async () => {
      repository.findSessionById.mockResolvedValue({
        session: baseSession(),
        communityName: 'SB Club',
        communityLogoUrl: null,
        categorySlug: 'pickleball',
        categoryName: 'Pickleball',
      });
      repository.findMember.mockResolvedValue({
        role: 'OWNER',
        status: 'JOINED',
      });
      repository.findUserById.mockResolvedValue(null as never);
      await expect(
        service.addParticipant({ id: HOST_ID }, SESSION_ID, {
          userId: MEMBER_ID,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('removeParticipant', () => {
    it('không cho xóa HOST qua endpoint này', async () => {
      repository.findSessionById.mockResolvedValue({
        session: baseSession(),
        communityName: 'SB Club',
        communityLogoUrl: null,
        categorySlug: 'pickleball',
        categoryName: 'Pickleball',
      });
      await expect(
        service.removeParticipant({ id: HOST_ID }, SESSION_ID, HOST_ID),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'CANNOT_REMOVE_HOST' }),
      });
    });

    it('404 khi participant không ở trạng thái JOINED', async () => {
      repository.findSessionById.mockResolvedValue({
        session: baseSession(),
        communityName: 'SB Club',
        communityLogoUrl: null,
        categorySlug: 'pickleball',
        categoryName: 'Pickleball',
      });
      repository.removeParticipant.mockResolvedValue(null as never);
      await expect(
        service.removeParticipant({ id: HOST_ID }, SESSION_ID, MEMBER_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('toPlayDate', () => {
    it('giữ đúng ngày dương lịch trong chuỗi ISO có offset +07:00', async () => {
      const session = baseSession({ communityId: null, visibility: 'PUBLIC' });
      repository.createWithHost.mockResolvedValue({
        ok: true,
        session,
        replayed: false,
      });
      repository.findSessionById.mockResolvedValue({
        session,
        communityName: null,
        communityLogoUrl: null,
        categorySlug: 'pickleball',
        categoryName: 'Pickleball',
      });
      repository.listParticipants.mockResolvedValue([]);
      await service.create(
        { id: HOST_ID },
        baseCreateDto({ startAt: '2026-09-17T00:30:00+07:00' }),
      );
      expect(repository.createWithHost.mock.calls[0][0]).toEqual(
        expect.objectContaining({ playDate: '2026-09-17' }),
      );
    });

    it('400 với startAt không hợp lệ', async () => {
      await expect(
        service.create(
          { id: HOST_ID },
          baseCreateDto({ startAt: 'not-a-date' }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  function futureSession(overrides = {}) {
    return {
      ...baseSession({
        playDate: '2030-05-01',
        startAt: new Date('2030-05-01T10:00:00+07:00'),
        status: 'OPEN',
      }),
      ...overrides,
    };
  }

  function sessionRow(session: Record<string, unknown>) {
    return {
      session,
      communityName: 'SB Club',
      communityLogoUrl: null,
      categorySlug: 'pickleball',
      categoryName: 'Pickleball',
    };
  }

  describe('cancel (Hủy kèo)', () => {
    it('host hủy kèo OPEN thành công, không set deletedAt', async () => {
      repository.findSessionById.mockResolvedValue(
        sessionRow(futureSession()) as never,
      );
      repository.cancelSession.mockResolvedValue({
        id: SESSION_ID,
        status: 'CANCELLED',
      } as never);
      const result = await service.cancel({ id: HOST_ID }, SESSION_ID);
      expect(repository.cancelSession).toHaveBeenCalledWith(SESSION_ID);
      expect(result).toMatchObject({ id: SESSION_ID, status: 'CANCELLED' });
    });

    it('từ chối hủy kèo đã CANCELLED (SESSION_ALREADY_CLOSED)', async () => {
      repository.findSessionById.mockResolvedValue(
        sessionRow(futureSession({ status: 'CANCELLED' })) as never,
      );
      await expect(
        service.cancel({ id: HOST_ID }, SESSION_ID),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'SESSION_ALREADY_CLOSED' }),
      });
      expect(repository.cancelSession).not.toHaveBeenCalled();
    });
  });

  describe('remove (Xóa kèo)', () => {
    it('từ chối xóa cứng khi chưa hủy (MUST_CANCEL_FIRST)', async () => {
      repository.findSessionById.mockResolvedValue(
        sessionRow(futureSession()) as never,
      );
      await expect(
        service.remove({ id: HOST_ID }, SESSION_ID),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'MUST_CANCEL_FIRST' }),
      });
      expect(repository.hardDelete).not.toHaveBeenCalled();
    });

    it('xóa cứng thành công sau khi đã CANCELLED', async () => {
      repository.findSessionById.mockResolvedValue(
        sessionRow(futureSession({ status: 'CANCELLED' })) as never,
      );
      repository.hardDelete.mockResolvedValue({ id: SESSION_ID } as never);
      const result = await service.remove({ id: HOST_ID }, SESSION_ID);
      expect(repository.hardDelete).toHaveBeenCalledWith(SESSION_ID);
      expect(result).toMatchObject({ id: SESSION_ID, deleted: true });
    });
  });

  describe('lazy auto-close', () => {
    it('getById tự chuyển OPEN quá giờ thành COMPLETED', async () => {
      const expired = baseSession({
        playDate: '2020-01-01',
        startAt: new Date('2020-01-01T10:00:00+07:00'),
        durationMinutes: 60,
        status: 'OPEN',
      });
      repository.findSessionById.mockResolvedValue(
        sessionRow(expired) as never,
      );
      repository.updateSession.mockResolvedValue({
        ...expired,
        status: 'COMPLETED',
      } as never);
      repository.listParticipants.mockResolvedValue([]);
      const result = await service.getById(SESSION_ID, HOST_ID);
      expect(repository.updateSession).toHaveBeenCalledWith(
        SESSION_ID,
        expect.objectContaining({ status: 'COMPLETED' }),
      );
      expect(result).toMatchObject({ status: 'COMPLETED' });
    });
  });

  describe('shared social links', () => {
    it('resolves a short code to its session ID', async () => {
      repository.findSessionIdByShortCode.mockResolvedValue(SESSION_ID);
      await expect(service.getByShortCode('abc12345678')).resolves.toEqual({
        id: SESSION_ID,
      });
    });

    it('does not reveal CLUB_ONLY details to a non-member', async () => {
      repository.findSessionById.mockResolvedValue(
        sessionRow(baseSession({ visibility: 'CLUB_ONLY' })) as never,
      );
      repository.findMember.mockResolvedValue(null as never);
      await expect(
        service.getById(SESSION_ID, MEMBER_ID),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'NOT_CLUB_MEMBER' }),
      });
      expect(repository.listParticipants).not.toHaveBeenCalled();
    });

    it('allows a platform admin to view CLUB_ONLY details', async () => {
      repository.findSessionById.mockResolvedValue(
        sessionRow(baseSession({ visibility: 'CLUB_ONLY' })) as never,
      );
      repository.listParticipants.mockResolvedValue([]);
      await expect(
        service.getById(SESSION_ID, MEMBER_ID, ['ADMIN']),
      ).resolves.toMatchObject({
        id: SESSION_ID,
      });
      expect(repository.findMember).not.toHaveBeenCalled();
    });
  });

  describe('listByCommunity', () => {
    it('manager thấy default OPEN,FULL,COMPLETED (kể cả quá ngày)', async () => {
      repository.findCommunityById.mockResolvedValue({
        id: COMMUNITY_ID,
        status: 'ACTIVE',
      });
      repository.findMember.mockResolvedValue({
        role: 'OWNER',
        status: 'JOINED',
      });
      repository.listByCommunity.mockResolvedValue({ items: [], total: 0 });
      const result = await service.listByCommunity(
        { id: HOST_ID },
        COMMUNITY_ID,
        {},
      );
      expect(repository.listByCommunity).toHaveBeenCalledWith(
        expect.objectContaining({
          communityId: COMMUNITY_ID,
          statuses: ['OPEN', 'FULL', 'COMPLETED'],
        }),
      );
      expect(result.meta).toMatchObject({ total: 0 });
    });

    it('member thường bị loại CANCELLED khỏi filter', async () => {
      repository.findCommunityById.mockResolvedValue({
        id: COMMUNITY_ID,
        status: 'ACTIVE',
      });
      repository.findMember.mockResolvedValue({
        role: 'MEMBER',
        status: 'JOINED',
      });
      repository.listByCommunity.mockResolvedValue({ items: [], total: 0 });
      await service.listByCommunity({ id: MEMBER_ID }, COMMUNITY_ID, {
        status: 'OPEN,CANCELLED',
      });
      expect(repository.listByCommunity).toHaveBeenCalledWith(
        expect.objectContaining({ statuses: ['OPEN'] }),
      );
    });

    it('khách ngoài club chỉ thấy PUBLIC', async () => {
      repository.findCommunityById.mockResolvedValue({
        id: COMMUNITY_ID,
        status: 'ACTIVE',
      });
      repository.findMember.mockResolvedValue(null as never);
      repository.listByCommunity.mockResolvedValue({ items: [], total: 0 });
      await service.listByCommunity({ id: MEMBER_ID }, COMMUNITY_ID, {});
      expect(repository.listByCommunity).toHaveBeenCalledWith(
        expect.objectContaining({ visibility: 'PUBLIC' }),
      );
    });

    it('400 với status không hợp lệ', async () => {
      repository.findCommunityById.mockResolvedValue({
        id: COMMUNITY_ID,
        status: 'ACTIVE',
      });
      await expect(
        service.listByCommunity({ id: HOST_ID }, COMMUNITY_ID, {
          status: 'WEIRD',
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'INVALID_STATUS' }),
      });
    });
  });

  describe('social chat', () => {
    function serviceWithChat() {
      const chat = {
        getOrCreateSocialRoom: jest.fn(),
        getMessages: jest.fn(),
        sendMessage: jest.fn(),
      };
      const svc = new SocialSessionsService(
        repository,
        chat as unknown as ChatService,
        regionsStub,
      );
      return { svc, chat };
    }

    it('participant gửi tin nhắn thành công', async () => {
      repository.findSessionById.mockResolvedValue(
        sessionRow(futureSession()) as never,
      );
      repository.isParticipant.mockResolvedValue(true);
      const { svc, chat } = serviceWithChat();
      chat.getOrCreateSocialRoom.mockResolvedValue({ id: 'room-1' });
      chat.sendMessage.mockResolvedValue({ id: 'msg-1' });
      const result = await svc.sendSocialMessage(
        { id: MEMBER_ID },
        SESSION_ID,
        {
          messageText: 'Mai đá đúng giờ nhé!',
        },
      );
      expect(chat.getOrCreateSocialRoom).toHaveBeenCalledWith(
        SESSION_ID,
        MEMBER_ID,
      );
      expect(chat.sendMessage).toHaveBeenCalledWith(
        MEMBER_ID,
        expect.objectContaining({ roomId: 'room-1' }),
      );
      expect(result).toMatchObject({ id: 'msg-1' });
    });

    it('người ngoài kèo không gửi được (FORBIDDEN_NOT_PARTICIPANT)', async () => {
      repository.findSessionById.mockResolvedValue(
        sessionRow(futureSession()) as never,
      );
      repository.isParticipant.mockResolvedValue(false);
      const { svc, chat } = serviceWithChat();
      await expect(
        svc.sendSocialMessage({ id: MEMBER_ID }, SESSION_ID, {
          messageText: 'Hi',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(chat.sendMessage).not.toHaveBeenCalled();
    });

    it('kèo COMPLETED chỉ đọc, không gửi được (SESSION_CLOSED)', async () => {
      repository.findSessionById.mockResolvedValue(
        sessionRow(futureSession({ status: 'COMPLETED' })) as never,
      );
      const { svc, chat } = serviceWithChat();
      await expect(
        svc.sendSocialMessage({ id: HOST_ID }, SESSION_ID, {
          messageText: 'Hi',
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'SESSION_CLOSED' }),
      });
      expect(chat.sendMessage).not.toHaveBeenCalled();
    });
  });

  describe('geolocation', () => {
    it('creates a session with deferred location and no coordinates', async () => {
      const session = baseSession({
        communityId: null,
        venueName: 'Quyết định sau',
        venueAddress: 'Quyết định sau',
      });
      repository.createWithHost.mockResolvedValue({
        ok: true,
        session,
        replayed: false,
      });
      repository.findSessionById.mockResolvedValue({
        session,
        communityName: null,
        communityLogoUrl: null,
        categorySlug: 'pickleball',
        categoryName: 'Pickleball',
      });
      repository.listParticipants.mockResolvedValue([]);

      await service.create(
        { id: HOST_ID },
        baseCreateDto({
          latitude: undefined,
          longitude: undefined,
          locationDeferred: true,
        }),
      );

      expect(repository.createWithHost.mock.calls[0][0]).toEqual(
        expect.objectContaining({
          venueName: 'Quyết định sau',
          venueAddress: 'Quyết định sau',
          latitude: null,
          longitude: null,
          venueId: null,
        }),
      );
      const prepareValues = repository.createWithHost.mock.calls[0][3]!;
      const regionResolveCount = (regionsStub.resolveByPoint as jest.Mock).mock.calls.length;
      const prepared = await prepareValues({} as never);
      expect(prepared).toEqual(expect.objectContaining({
        venueName: 'Quyết định sau',
        venueAddress: 'Quyết định sau',
        latitude: null,
        longitude: null,
      }));
      expect((regionsStub.resolveByPoint as jest.Mock).mock.calls).toHaveLength(regionResolveCount);
    });

    it('rejects a deferred request that also specifies a venue', async () => {
      await expect(
        service.create(
          { id: HOST_ID },
          baseCreateDto({ locationDeferred: true }),
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'DEFERRED_LOCATION_CONFLICT' }),
      });
    });

    it('requires a pin for new Social sessions', async () => {
      await expect(service.create({ id: HOST_ID }, baseCreateDto({ latitude: undefined, longitude: undefined })))
        .rejects.toMatchObject({ response: expect.objectContaining({ code: 'LOCATION_REQUIRED' }) });
      expect(repository.createWithHost).not.toHaveBeenCalled();
    });
    it('create từ chối khi chỉ có latitude (LOCATION_PAIR_REQUIRED)', async () => {
      await expect(
        service.create({ id: HOST_ID }, baseCreateDto({ latitude: 10.7769, longitude: undefined })),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'LOCATION_PAIR_REQUIRED' }),
      });
      expect(repository.createWithHost).not.toHaveBeenCalled();
    });

    it('create lưu lat/lng khi đi cặp', async () => {
      const session = baseSession({ communityId: null, visibility: 'PUBLIC' });
      repository.createWithHost.mockResolvedValue({
        ok: true,
        session,
        replayed: false,
      });
      repository.findSessionById.mockResolvedValue({
        session,
        communityName: null,
        communityLogoUrl: null,
        categorySlug: 'pickleball',
        categoryName: 'Pickleball',
      });
      repository.listParticipants.mockResolvedValue([]);
      await service.create(
        { id: HOST_ID },
        baseCreateDto({ latitude: 10.7769, longitude: 106.7009 }),
      );
      expect(repository.createWithHost.mock.calls[0][0]).toEqual(
        expect.objectContaining({ latitude: 10.7769, longitude: 106.7009 }),
      );
    });

    it('update từ chối khi chỉ có longitude (LOCATION_PAIR_REQUIRED)', async () => {
      repository.findSessionById.mockResolvedValue(sessionRow(futureSession()) as never);
      await expect(
        service.update({ id: HOST_ID }, SESSION_ID, { longitude: 106.7009 }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'LOCATION_PAIR_REQUIRED' }),
      });
      expect(repository.updateSession).not.toHaveBeenCalled();
    });

    it('list từ chối khi chỉ có lat (LOCATION_PAIR_REQUIRED)', async () => {
      await expect(service.list({ date: '2026-09-17', lat: 10.7769 } as never)).rejects.toMatchObject(
        {
          response: expect.objectContaining({ code: 'LOCATION_PAIR_REQUIRED' }),
        },
      );
      expect(repository.listByDate).not.toHaveBeenCalled();
    });

    it('list chuyển tiếp lat/lng/radiusKm/sortBy + map distanceKm', async () => {
      const session = baseSession({ communityId: null, visibility: 'PUBLIC' });
      repository.listByDate.mockResolvedValue({
        items: [
          {
            session,
            communityName: null,
            communityLogoUrl: null,
            categorySlug: 'pickleball',
            distanceKm: 1.25,
          },
        ],
        total: 1,
      });
      const result = await service.list({
        date: '2026-09-17',
        lat: 10.7769,
        lng: 106.7009,
        radiusKm: 5,
        sortBy: 'DISTANCE',
      });
      expect(repository.listByDate).toHaveBeenCalledWith(
        expect.objectContaining({ lat: 10.7769, lng: 106.7009, radiusKm: 5, sortBy: 'DISTANCE' }),
      );
      expect(result.items[0]).toMatchObject({ distanceKm: 1.25 });
    });

    it('listByCommunity chuyển tiếp geo + distanceKm null khi venue chưa ghim', async () => {
      repository.findCommunityById.mockResolvedValue({ id: COMMUNITY_ID, status: 'ACTIVE' });
      repository.findMember.mockResolvedValue({ role: 'MEMBER', status: 'JOINED' });
      const session = baseSession();
      repository.listByCommunity.mockResolvedValue({
        items: [
          {
            session,
            communityName: 'SB Club',
            communityLogoUrl: null,
            categorySlug: 'pickleball',
            distanceKm: null,
          },
        ],
        total: 1,
      });
      const result = await service.listByCommunity(
        { id: MEMBER_ID },
        COMMUNITY_ID,
        { lat: 10.7769, lng: 106.7009, radiusKm: 10, sortBy: 'DISTANCE' },
      );
      expect(repository.listByCommunity).toHaveBeenCalledWith(
        expect.objectContaining({ lat: 10.7769, lng: 106.7009, radiusKm: 10, sortBy: 'DISTANCE' }),
      );
      expect(result.items[0]).toMatchObject({ distanceKm: null });
    });
  });
});
