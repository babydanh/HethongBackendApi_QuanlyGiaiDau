import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { CreateSocialPickupDto } from './dto/create-social-pickup.dto';
import { QuerySocialPickupsDto } from './dto/query-social-pickups.dto';
import { SocialPickupsRepository } from './social-pickups.repository';

type Actor = { id: string; roles?: string[] };

function normalizeKey(key?: string) {
  const normalized = key?.trim() || null;
  if (normalized && normalized.length > 128) {
    throw new BadRequestException({ code: 'IDEMPOTENCY_KEY_TOO_LONG' });
  }
  return normalized;
}

function parseVietnamDateTime(date: string, time: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new BadRequestException({ code: 'INVALID_PICKUP_TIME' });
  }
  const value = new Date(date + 'T' + time + ':00+07:00');
  if (Number.isNaN(value.getTime())) {
    throw new BadRequestException({ code: 'INVALID_PICKUP_TIME' });
  }
  return value;
}

function fingerprint(dto: CreateSocialPickupDto) {
  return createHash('sha256')
    .update(JSON.stringify({
      categoryId: dto.categoryId,
      title: dto.title.trim(),
      description: dto.description?.trim() || null,
      playDate: dto.playDate,
      startTime: dto.startTime,
      endTime: dto.endTime,
      location: dto.location.trim(),
      venueId: dto.venueId ?? null,
      courtId: dto.courtId ?? null,
      feePerSlot: dto.feePerSlot ?? 0,
      maxSlots: dto.maxSlots,
      levelRequirement: dto.levelRequirement?.trim() || 'ALL',
      genderRequirement: dto.genderRequirement ?? 'ANY',
    }))
    .digest('hex');
}

@Injectable()
export class SocialPickupsService {
  constructor(private readonly repository: SocialPickupsRepository) {}

  async create(actor: Actor, dto: CreateSocialPickupDto, rawKey?: string) {
    const title = dto.title.trim();
    const location = dto.location.trim();
    if (title.length < 3 || location.length < 2) {
      throw new BadRequestException({ code: 'INVALID_PICKUP_TEXT' });
    }
    if (dto.courtId && !dto.venueId) {
      throw new BadRequestException({ code: 'COURT_REQUIRES_VENUE' });
    }

    if (dto.venueId) {
      const venueCourt = await this.repository.findVenueCourt(dto.venueId, dto.courtId);
      if (!venueCourt || (dto.courtId && venueCourt.courtId !== dto.courtId)) {
        throw new BadRequestException({ code: 'INVALID_PICKUP_VENUE_OR_COURT' });
      }
    }

    const startAt = parseVietnamDateTime(dto.playDate, dto.startTime);
    const endAt = parseVietnamDateTime(dto.playDate, dto.endTime);
    if (endAt <= startAt || startAt <= new Date()) {
      throw new BadRequestException({ code: 'INVALID_PICKUP_TIME' });
    }

    const category = await this.repository.findCategory(dto.categoryId);
    if (!category) throw new BadRequestException({ code: 'INVALID_PICKUP_CATEGORY' });

    const key = normalizeKey(rawKey);
    const creationFingerprint = fingerprint(dto);
    if (key) {
      const existing = await this.repository.findByCreationKey(actor.id, key);
      if (existing) {
        if (existing.creationFingerprint !== creationFingerprint) {
          throw new ConflictException({ code: 'CREATE_IDEMPOTENCY_KEY_REUSED' });
        }
        return this.get(existing.id, actor);
      }
    }

    const created = await this.repository.createPickup({
      hostUserId: actor.id,
      categoryId: category.id,
      title,
      description: dto.description?.trim() || null,
      playDate: dto.playDate,
      startTime: dto.startTime,
      endTime: dto.endTime,
      location,
      venueId: dto.venueId ?? null,
      courtId: dto.courtId ?? null,
      feePerSlot: dto.feePerSlot ?? 0,
      maxSlots: dto.maxSlots,
      levelRequirement: dto.levelRequirement?.trim() || 'ALL',
      genderRequirement: dto.genderRequirement ?? 'ANY',
      creationIdempotencyKey: key,
      creationFingerprint,
    });

    if (key && created.creationFingerprint !== creationFingerprint) {
      throw new ConflictException({ code: 'CREATE_IDEMPOTENCY_KEY_REUSED' });
    }
    return this.get(created.id, actor);
  }

  async list(query: QuerySocialPickupsDto, viewer?: Actor) {
    const result = await this.repository.list({
      date: query.date,
      categoryId: query.categoryId,
      limit: query.limit ?? 20,
      cursor: query.cursor,
      viewerId: viewer?.id,
    });
    if (result.invalidCursor) throw new BadRequestException({ code: 'INVALID_CURSOR' });
    return {
      data: result.data.map((item) => this.toApi(item)),
      meta: result.meta,
    };
  }

  async listMine(actor: Actor) {
    const items = await this.repository.listMine(actor.id);
    return { data: items.filter(Boolean).map((item) => this.toApi(item!)) };
  }

  async get(id: string, viewer?: Actor) {
    const item = await this.repository.getProjection(id, viewer?.id);
    if (!item) throw new NotFoundException({ code: 'PICKUP_NOT_FOUND' });
    return { data: this.toApi(item) };
  }

  async getMyParticipant(id: string, actor: Actor) {
    const item = await this.repository.getProjection(id, actor.id);
    if (!item) throw new NotFoundException({ code: 'PICKUP_NOT_FOUND' });
    return {
      data: { isJoined: item.isJoined, isHost: item.pickup.hostUserId === actor.id },
    };
  }

  async join(id: string, actor: Actor) {
    const result = await this.repository.joinPickup(id, actor.id);
    if (result.kind === 'NOT_FOUND') throw new NotFoundException({ code: 'PICKUP_NOT_FOUND' });
    if (result.kind === 'TERMINAL') throw new ConflictException({ code: 'PICKUP_TERMINAL' });
    if (result.kind === 'FULL') throw new ConflictException({ code: 'PICKUP_FULL' });
    if (result.kind === 'ALREADY_JOINED') throw new ConflictException({ code: 'PICKUP_ALREADY_JOINED' });
    const item = await this.repository.getProjection(id, actor.id);
    return { data: this.toApi(item!) };
  }

  async withdraw(id: string, actor: Actor) {
    const result = await this.repository.withdrawPickup(id, actor.id);
    if (result.kind === 'NOT_FOUND') throw new NotFoundException({ code: 'PICKUP_NOT_FOUND' });
    if (result.kind === 'HOST_CANNOT_WITHDRAW') throw new ConflictException({ code: 'PICKUP_HOST_MUST_CANCEL' });
    if (result.kind === 'NOT_JOINED') throw new ConflictException({ code: 'PICKUP_NOT_JOINED' });
    const item = await this.repository.getProjection(id, actor.id);
    return { data: this.toApi(item!) };
  }

  async cancel(id: string, actor: Actor) {
    const updated = await this.repository.cancelPickup(id, actor.id);
    if (!updated) {
      const item = await this.repository.getProjection(id, actor.id);
      if (!item) throw new NotFoundException({ code: 'PICKUP_NOT_FOUND' });
      if (item.pickup.hostUserId !== actor.id) throw new ForbiddenException({ code: 'PICKUP_NOT_OWNER' });
      throw new ConflictException({ code: 'PICKUP_TERMINAL' });
    }
    return { data: this.toApi((await this.repository.getProjection(id, actor.id))!) };
  }

  private toApi(item: Awaited<ReturnType<SocialPickupsRepository['getProjection']>>) {
    if (!item) return null;
    return {
      id: item.pickup.id,
      type: 'PERSONAL_PICKUP' as const,
      title: item.pickup.title,
      description: item.pickup.description,
      playDate: item.pickup.playDate,
      startTime: item.pickup.startTime,
      endTime: item.pickup.endTime,
      location: item.pickup.courtLocation,
      sport: item.category.name,
      sportTier: item.pickup.levelRequirement,
      feePerSlot: item.pickup.feePerSlot,
      maxSlots: item.pickup.maxSlots,
      currentSlots: item.participantCount,
      status: item.pickup.status,
      personalHost: {
        ...item.host,
        name: item.host.name ?? 'Người chơi',
      },
      isJoined: item.isJoined,
      joinedPlayers: item.participants.slice(0, 8).map((participant) => ({
        ...participant,
        name: participant.name ?? 'Người chơi',
      })),
    };
  }
}
