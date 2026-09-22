import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { SocialSessionsService } from './social-sessions.service';
import { SocialSessionsRepository } from './social-sessions.repository';

function makeRepositoryMock(): jest.Mocked<SocialSessionsRepository> {
  return {
    findCategoryBySlug: jest.fn(),
    findCommunityById: jest.fn(),
    findMember: jest.fn(),
    findUserById: jest.fn(),
    findSessionById: jest.fn(),
    listByDate: jest.fn(),
    listParticipants: jest.fn(),
    createWithHost: jest.fn(),
    joinOrAddParticipant: jest.fn(),
    removeParticipant: jest.fn(),
    updateSession: jest.fn(),
    softDelete: jest.fn(),
    updatePaymentStatus: jest.fn(),
    recentSessionsByHost: jest.fn(),
    getDb: jest.fn(),
  } as unknown as jest.Mocked<SocialSessionsRepository>;
}

const CATEGORY_ID = '11111111-1111-4111-8111-111111111111';
const SESSION_ID = '22222222-2222-4222-8222-222222222222';
const HOST_ID = '33333333-3333-4333-8333-333333333333';
const MEMBER_ID = '44444444-4444-4444-8444-444444444444';
const COMMUNITY_ID = '55555555-5555-4555-8555-555555555555';

function baseSession(overrides = {}) {
  return {
    id: SESSION_ID,
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
    venueName: '22 Cộng Hòa',
    venueAddress: '22 Cộng Hòa, Tân Bình',
    ...overrides,
  };
}

describe('SocialSessionsService', () => {
  let service: SocialSessionsService;
  let repository: jest.Mocked<SocialSessionsRepository>;

  beforeEach(() => {
    repository = makeRepositoryMock();
    service = new SocialSessionsService(repository);
    repository.findCategoryBySlug.mockResolvedValue({ id: CATEGORY_ID, slug: 'pickleball' });
  });

  describe('create', () => {
    it('từ chối CLUB_ONLY khi không gắn Club', async () => {
      await expect(
        service.create({ id: HOST_ID }, baseCreateDto({ visibility: 'CLUB_ONLY' })),
      ).rejects.toMatchObject({ response: { code: 'CLUB_ONLY_REQUIRES_COMMUNITY' } });
    });

    it('từ chối tạo kèo CLUB_ONLY khi caller không phải member', async () => {
      repository.findCommunityById.mockResolvedValue({ id: COMMUNITY_ID, status: 'ACTIVE' });
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
      repository.createWithHost.mockResolvedValue({ session, host: {} as never });
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
      repository.findMember.mockResolvedValue({ role: 'MEMBER', status: 'JOINED' });
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
      const result = await service.update({ id: HOST_ID }, SESSION_ID, { title: 'Tên mới' });
      expect(repository.updateSession).toHaveBeenCalledWith(
        SESSION_ID,
        expect.objectContaining({ title: 'Tên mới' }),
      );
      expect(result).toBeDefined();
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
      await expect(service.join({ id: MEMBER_ID }, SESSION_ID, {})).rejects.toBeInstanceOf(
        ForbiddenException,
      );
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
      repository.joinOrAddParticipant.mockResolvedValue({ ok: false, code: 'SESSION_FULL' });
      await expect(service.join({ id: MEMBER_ID }, SESSION_ID, {})).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('404 khi session không tồn tại', async () => {
      repository.findSessionById.mockResolvedValue(null as never);
      await expect(service.join({ id: MEMBER_ID }, SESSION_ID, {})).rejects.toBeInstanceOf(
        NotFoundException,
      );
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
      repository.findMember.mockResolvedValue({ role: 'OWNER', status: 'JOINED' });
      repository.findUserById.mockResolvedValue(null as never);
      await expect(
        service.addParticipant({ id: HOST_ID }, SESSION_ID, { userId: MEMBER_ID }),
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
      repository.createWithHost.mockResolvedValue({ session, host: {} as never });
      repository.findSessionById.mockResolvedValue({
        session,
        communityName: null,
        communityLogoUrl: null,
        categorySlug: 'pickleball',
        categoryName: 'Pickleball',
      });
      repository.listParticipants.mockResolvedValue([]);
      await service.create({ id: HOST_ID }, baseCreateDto({ startAt: '2026-09-17T00:30:00+07:00' }));
      expect(repository.createWithHost).toHaveBeenCalledWith(
        expect.objectContaining({ playDate: '2026-09-17' }),
        HOST_ID,
      );
    });

    it('400 với startAt không hợp lệ', async () => {
      await expect(
        service.create({ id: HOST_ID }, baseCreateDto({ startAt: 'not-a-date' })),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
