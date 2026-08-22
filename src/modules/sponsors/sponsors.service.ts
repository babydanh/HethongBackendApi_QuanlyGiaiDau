import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import {
  CreateSponsorDto,
  SPONSOR_STATUSES,
  SPONSOR_TIERS,
  type SponsorStatus,
  type SponsorTier,
} from './dto/create-sponsor.dto';
import { UpdateSponsorDto } from './dto/update-sponsor.dto';
import { SponsorsRepository } from './sponsors.repository';

const HTTP_PROTOCOLS = new Set(['http:', 'https:']);

@Injectable()
export class SponsorsService {
  constructor(private readonly sponsorsRepository: SponsorsRepository) {}

  async listPublic(tournamentId: string) {
    const tournament = await this.sponsorsRepository.findTournamentForAccess(tournamentId);
    if (
      !tournament ||
      tournament.deletedAt ||
      tournament.visibility !== 'PUBLIC' ||
      ['DRAFT', 'CANCELLED'].includes(tournament.status)
    ) {
      throw new NotFoundException('Tournament not found');
    }

    return this.sponsorsRepository.listForPublic(tournamentId);
  }

  async listForOrganizer(tournamentId: string, user: JwtPayload) {
    await this.assertManager(tournamentId, user);
    return this.sponsorsRepository.listForOrganizer(tournamentId);
  }

  async create(tournamentId: string, user: JwtPayload, dto: CreateSponsorDto) {
    const tournament = await this.assertManager(tournamentId, user);
    const normalized = this.normalizePayload(dto);

    const sponsor = await this.sponsorsRepository.create({
      tournamentId,
      displayName: normalized.displayName!,
      tier: normalized.tier!,
      logoUrl: normalized.logoUrl!,
      websiteUrl: normalized.websiteUrl,
      shortDescription: normalized.shortDescription,
      displayOrder: normalized.displayOrder ?? 0,
      status: normalized.status ?? 'DRAFT',
      isPublic: normalized.isPublic ?? true,
      startAt: normalized.startAt,
      endAt: normalized.endAt,
      createdBy: user.sub,
      updatedBy: user.sub,
    });

    if (!sponsor) throw new BadRequestException('Unable to create sponsor');
    return this.toOrganizerResponse(sponsor, tournament.id);
  }

  async update(
    tournamentId: string,
    sponsorId: string,
    user: JwtPayload,
    dto: UpdateSponsorDto,
  ) {
    await this.assertManager(tournamentId, user);
    const existing = await this.sponsorsRepository.findById(tournamentId, sponsorId);
    if (!existing) throw new NotFoundException('Sponsor not found');

    const normalized = this.normalizePayload(dto);
    const sponsor = await this.sponsorsRepository.update(tournamentId, sponsorId, {
      ...normalized,
      updatedBy: user.sub,
    });

    if (!sponsor) throw new NotFoundException('Sponsor not found');
    return this.toOrganizerResponse(sponsor, tournamentId);
  }

  async archive(tournamentId: string, sponsorId: string, user: JwtPayload) {
    await this.assertManager(tournamentId, user);
    const existing = await this.sponsorsRepository.findById(tournamentId, sponsorId);
    if (!existing) throw new NotFoundException('Sponsor not found');

    const sponsor = await this.sponsorsRepository.archive(tournamentId, sponsorId, user.sub);
    if (!sponsor) throw new NotFoundException('Sponsor not found');
    return this.toOrganizerResponse(sponsor, tournamentId);
  }

  private async assertManager(tournamentId: string, user: JwtPayload) {
    const tournament = await this.sponsorsRepository.findTournamentForAccess(tournamentId);
    if (!tournament || tournament.deletedAt) {
      throw new NotFoundException('Tournament not found');
    }

    const systemRoles = [...(user.roles ?? []), ...(user.role ? [user.role] : [])];
    if (systemRoles.includes('ADMIN') || tournament.createdBy === user.sub) {
      return tournament;
    }

    if (await this.sponsorsRepository.isCoOrganizer(tournamentId, user.sub)) {
      return tournament;
    }

    if (tournament.communityId) {
      const member = await this.sponsorsRepository.findCommunityMember(
        tournament.communityId,
        user.sub,
      );
      if (member?.status === 'JOINED' && ['OWNER', 'MODERATOR'].includes(member.role)) {
        return tournament;
      }
    }

    throw new ForbiddenException('You do not have permission to manage sponsors');
  }

  private normalizePayload(
    dto: CreateSponsorDto | UpdateSponsorDto,
  ): Partial<{
    displayName: string;
    tier: SponsorTier;
    logoUrl: string;
    websiteUrl: string | null;
    shortDescription: string | null;
    displayOrder: number;
    status: SponsorStatus;
    isPublic: boolean;
    startAt: Date | null;
    endAt: Date | null;
  }> {
    const source = dto as Record<string, unknown>;
    const result: ReturnType<SponsorsService['normalizePayload']> = {};

    if ('displayName' in source && typeof source.displayName === 'string') {
      result.displayName = source.displayName.trim();
      if (!result.displayName) throw new BadRequestException('displayName is required');
    }
    if ('tier' in source && source.tier !== undefined) {
      if (!SPONSOR_TIERS.includes(source.tier as SponsorTier)) {
        throw new BadRequestException('Invalid sponsor tier');
      }
      result.tier = source.tier as SponsorTier;
    }
    if ('logoUrl' in source && typeof source.logoUrl === 'string') {
      result.logoUrl = this.normalizeUrl(source.logoUrl, 'logoUrl');
    }
    if ('websiteUrl' in source) {
      result.websiteUrl = source.websiteUrl
        ? this.normalizeUrl(String(source.websiteUrl), 'websiteUrl')
        : null;
    }
    if ('shortDescription' in source) {
      result.shortDescription = source.shortDescription
        ? String(source.shortDescription).trim()
        : null;
    }
    if ('displayOrder' in source && source.displayOrder !== undefined) {
      if (!Number.isInteger(source.displayOrder) || Number(source.displayOrder) < 0) {
        throw new BadRequestException('displayOrder must be a non-negative integer');
      }
      result.displayOrder = Number(source.displayOrder);
    }
    if ('status' in source && source.status !== undefined) {
      if (!SPONSOR_STATUSES.includes(source.status as SponsorStatus)) {
        throw new BadRequestException('Invalid sponsor status');
      }
      result.status = source.status as SponsorStatus;
    }
    if ('isPublic' in source && source.isPublic !== undefined) {
      result.isPublic = Boolean(source.isPublic);
    }

    const startAt = this.parseDate(source.startAt, 'startAt');
    const endAt = this.parseDate(source.endAt, 'endAt');
    if ('startAt' in source) result.startAt = startAt;
    if ('endAt' in source) result.endAt = endAt;
    if (startAt && endAt && startAt > endAt) {
      throw new BadRequestException('startAt must be before or equal to endAt');
    }

    return result;
  }

  private parseDate(value: unknown, field: string) {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    const parsed = new Date(String(value));
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${field} must be a valid ISO date`);
    }
    return parsed;
  }

  private normalizeUrl(value: string, field: string) {
    const trimmed = value.trim();
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      throw new BadRequestException(`${field} must be a valid URL`);
    }
    if (!HTTP_PROTOCOLS.has(url.protocol)) {
      throw new BadRequestException(`${field} must use http or https`);
    }
    return url.toString();
  }

  private toOrganizerResponse<T extends Record<string, unknown>>(sponsor: T, tournamentId: string) {
    return { ...sponsor, tournamentId };
  }
}
