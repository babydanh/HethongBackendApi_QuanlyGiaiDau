import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { SocialSessionsService } from './social-sessions.service';
import { SocialSessionsRepository } from './social-sessions.repository';
import { ChatService } from '../chat/chat.service';

function makeRepositoryMock(): jest.Mocked<SocialSessionsRepository> {
  return {
    findCategoryBySlug: jest.fn(),
    findCommunityById: jest.fn(),
    findMember: jest.fn(),
    findUserById: jest.fn(),
    findSessionById: jest.fn(),
    listByDate: jest.fn(),
    listByCommunity: jest.fn(),
    isParticipant: jest.fn(),
    closeExpiredSessions: jest.fn(),
    listParticipants: jest.fn(),
    createWithHost: jest.fn(),
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
    repository.closeExpiredSessions.mockResolvedValue([]);
    repository.isParticipant.mockResolvedValue(false);
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
      repository.findSessionById.mockResolvedValue(sessionRow(futureSession()) as never);
      repository.cancelSession.mockResolvedValue({ id: SESSION_ID, status: 'CANCELLED' } as never);
      const result = await service.cancel({ id: HOST_ID }, SESSION_ID);
      expect(repository.cancelSession).toHaveBeenCalledWith(SESSION_ID);
      expect(result).toMatchObject({ id: SESSION_ID, status: 'CANCELLED' });
    });

    it('từ chối hủy kèo đã CANCELLED (SESSION_ALREADY_CLOSED)', async () => {
      repository.findSessionById.mockResolvedValue(
        sessionRow(futureSession({ status: 'CANCELLED' })) as never,
      );
      await expect(service.cancel({ id: HOST_ID }, SESSION_ID)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'SESSION_ALREADY_CLOSED' }),
      });
      expect(repository.cancelSession).not.toHaveBeenCalled();
    });
  });

  describe('remove (Xóa kèo)', () => {
    it('từ chối xóa cứng khi chưa hủy (MUST_CANCEL_FIRST)', async () => {
      repository.findSessionById.mockResolvedValue(sessionRow(futureSession()) as never);
      await expect(service.remove({ id: HOST_ID }, SESSION_ID)).rejects.toMatchObject({
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
      repository.findSessionById.mockResolvedValue(sessionRow(expired) as never);
      repository.updateSession.mockResolvedValue({ ...expired, status: 'COMPLETED' } as never);
      repository.listParticipants.mockResolvedValue([]);
      const result = await service.getById(SESSION_ID, HOST_ID);
      expect(repository.updateSession).toHaveBeenCalledWith(
        SESSION_ID,
        expect.objectContaining({ status: 'COMPLETED' }),
      );
      expect(result).toMatchObject({ status: 'COMPLETED' });
    });
  });

  describe('listByCommunity', () => {
    it('manager thấy default OPEN,FULL,COMPLETED (kể cả quá ngày)', async () => {
      repository.findCommunityById.mockResolvedValue({ id: COMMUNITY_ID, status: 'ACTIVE' });
      repository.findMember.mockResolvedValue({ role: 'OWNER', status: 'JOINED' });
      repository.listByCommunity.mockResolvedValue({ items: [], total: 0 });
      const result = await service.listByCommunity({ id: HOST_ID }, COMMUNITY_ID, {});
      expect(repository.listByCommunity).toHaveBeenCalledWith(
        expect.objectContaining({
          communityId: COMMUNITY_ID,
          statuses: ['OPEN', 'FULL', 'COMPLETED'],
        }),
      );
      expect(result.meta).toMatchObject({ total: 0 });
    });

    it('member thường bị loại CANCELLED khỏi filter', async () => {
      repository.findCommunityById.mockResolvedValue({ id: COMMUNITY_ID, status: 'ACTIVE' });
      repository.findMember.mockResolvedValue({ role: 'MEMBER', status: 'JOINED' });
      repository.listByCommunity.mockResolvedValue({ items: [], total: 0 });
      await service.listByCommunity({ id: MEMBER_ID }, COMMUNITY_ID, { status: 'OPEN,CANCELLED' });
      expect(repository.listByCommunity).toHaveBeenCalledWith(
        expect.objectContaining({ statuses: ['OPEN'] }),
      );
    });

    it('khách ngoài club chỉ thấy PUBLIC', async () => {
      repository.findCommunityById.mockResolvedValue({ id: COMMUNITY_ID, status: 'ACTIVE' });
      repository.findMember.mockResolvedValue(null as never);
      repository.listByCommunity.mockResolvedValue({ items: [], total: 0 });
      await service.listByCommunity({ id: MEMBER_ID }, COMMUNITY_ID, {});
      expect(repository.listByCommunity).toHaveBeenCalledWith(
        expect.objectContaining({ visibility: 'PUBLIC' }),
      );
    });

    it('400 với status không hợp lệ', async () => {
      repository.findCommunityById.mockResolvedValue({ id: COMMUNITY_ID, status: 'ACTIVE' });
      await expect(
        service.listByCommunity({ id: HOST_ID }, COMMUNITY_ID, { status: 'WEIRD' }),
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
      );
      return { svc, chat };
    }

    it('participant gửi tin nhắn thành công', async () => {
      repository.findSessionById.mockResolvedValue(sessionRow(futureSession()) as never);
      repository.isParticipant.mockResolvedValue(true);
      const { svc, chat } = serviceWithChat();
      chat.getOrCreateSocialRoom.mockResolvedValue({ id: 'room-1' });
      chat.sendMessage.mockResolvedValue({ id: 'msg-1' });
      const result = await svc.sendSocialMessage({ id: MEMBER_ID }, SESSION_ID, {
        messageText: 'Mai đá đúng giờ nhé!',
      });
      expect(chat.getOrCreateSocialRoom).toHaveBeenCalledWith(SESSION_ID, MEMBER_ID);
      expect(chat.sendMessage).toHaveBeenCalledWith(
        MEMBER_ID,
        expect.objectContaining({ roomId: 'room-1' }),
      );
      expect(result).toMatchObject({ id: 'msg-1' });
    });

    it('người ngoài kèo không gửi được (FORBIDDEN_NOT_PARTICIPANT)', async () => {
      repository.findSessionById.mockResolvedValue(sessionRow(futureSession()) as never);
      repository.isParticipant.mockResolvedValue(false);
      const { svc, chat } = serviceWithChat();
      await expect(
        svc.sendSocialMessage({ id: MEMBER_ID }, SESSION_ID, { messageText: 'Hi' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(chat.sendMessage).not.toHaveBeenCalled();
    });

    it('kèo COMPLETED chỉ đọc, không gửi được (SESSION_CLOSED)', async () => {
      repository.findSessionById.mockResolvedValue(
        sessionRow(futureSession({ status: 'COMPLETED' })) as never,
      );
      const { svc, chat } = serviceWithChat();
      await expect(
        svc.sendSocialMessage({ id: HOST_ID }, SESSION_ID, { messageText: 'Hi' }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'SESSION_CLOSED' }),
      });
      expect(chat.sendMessage).not.toHaveBeenCalled();
    });
  });
});
