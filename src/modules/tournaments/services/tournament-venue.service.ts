import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TournamentsRepository } from '../tournaments.repository';
import { TournamentAccessService } from './tournament-access.service';
import { CreateTournamentVenueDto } from '../dto/create-tournament-venue.dto';
import { CreateVenueCourtDto } from '../../venues/dto/create-venue-court.dto';
import { CreateVenueDto } from '../../venues/dto/create-venue.dto';
import { UpdateVenueDto } from '../../venues/dto/update-venue.dto';
import { CreateBatchCourtsDto } from '../../venues/dto/create-batch-courts.dto';
import { VenuesService } from '../../venues/venues.service';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

@Injectable()
export class TournamentVenueService {
  constructor(
    private readonly tournamentsRepository: TournamentsRepository,
    private readonly venuesService: VenuesService,
    private readonly tournamentAccessService: TournamentAccessService,
  ) {}
  private async getManagedTournamentForCourtSetup(
    tournamentId: string,
    userId: string,
    systemRoles: string[] = [],
  ) {
    const row = await this.tournamentsRepository.findById(tournamentId);
    if (!row) throw new NotFoundException('Tournament not found');
    const tournament = row;
    const allowed = await this.tournamentAccessService.isManager({
      id: tournament.id,
      createdBy: tournament.createdBy,
      communityId: tournament.communityId,
    }, userId, systemRoles);
    if (!allowed) {
      throw new ForbiddenException(
        'Bạn không có quyền cấu hình sân cho giải đấu này.',
      );
    }
    return tournament;
  }
  // ── MULTI-VENUE & COURTS MANAGEMENT ──

  async getTournamentVenuesWithCourts(
    tournamentId: string,
    user: JwtPayload,
    systemRoles: string[] = [],
  ) {
    const tournament = await this.getManagedTournamentForCourtSetup(
      tournamentId,
      user.sub,
      systemRoles,
    );
    const config = (tournament.tournamentConfig || {}) as Record<
      string,
      unknown
    >;
    const configuredVenueIds = Array.isArray(config.venueIds)
      ? (config.venueIds as string[])
      : [];
    const allVenueIds = Array.from(
      new Set(
        [tournament.venueId, ...configuredVenueIds].filter((v): v is string =>
          Boolean(v),
        ),
      ),
    );

    const venuesWithCourts = await Promise.all(
      allVenueIds.map(async (venueId) => {
        try {
          const venue = await this.venuesService.findOne(venueId);
          return {
            ...venue,
            isDefault: venue.id === tournament.venueId,
            courts: venue.courts ?? [],
          };
        } catch {
          return null;
        }
      }),
    );

    return venuesWithCourts.filter(Boolean);
  }

  async createTournamentVenue(
    tournamentId: string,
    dto: CreateTournamentVenueDto,
    user: JwtPayload,
    systemRoles: string[] = [],
  ) {
    const tournament = await this.getManagedTournamentForCourtSetup(
      tournamentId,
      user.sub,
      systemRoles,
    );

    // The organizer can reuse a venue that was created earlier. Keep the
    // existing venue row and only add its id to this tournament configuration.
    // This prevents duplicate venue cards and preserves the venue's courts.
    const venue = dto.venueId
      ? await this.venuesService.findOne(dto.venueId)
      : await this.venuesService.create(user.sub, dto);

    const config = (tournament.tournamentConfig || {}) as Record<
      string,
      unknown
    >;
    const existingVenueIds = Array.isArray(config.venueIds)
      ? (config.venueIds as string[])
      : [];
    const updatedVenueIds = Array.from(
      new Set([...existingVenueIds, venue.id]),
    );

    const shouldSetDefault = Boolean(dto.isDefault || !tournament.venueId);
    await this.tournamentsRepository.update(tournamentId, user.sub, {
      ...(shouldSetDefault && { venueId: venue.id }),
      tournamentConfig: {
        ...config,
        venueIds: updatedVenueIds,
      },
    });

    if (!dto.venueId && dto.initialCourtCount && dto.initialCourtCount > 0) {
      await this.venuesService.addCourtsBatch(
        venue.id,
        dto.initialCourtCount,
        dto.courtPrefix || 'Sân',
      );
    }

    const createdVenue = await this.venuesService.findOne(venue.id);
    return {
      ...createdVenue,
      isDefault: shouldSetDefault,
      courts: createdVenue.courts ?? [],
    };
  }

  async updateTournamentVenue(
    tournamentId: string,
    venueId: string,
    dto: UpdateVenueDto,
    user: JwtPayload,
    systemRoles: string[] = [],
  ) {
    await this.getManagedTournamentForCourtSetup(
      tournamentId,
      user.sub,
      systemRoles,
    );
    return this.venuesService.update(venueId, user.sub, dto);
  }

  async setDefaultTournamentVenue(
    tournamentId: string,
    venueId: string,
    user: JwtPayload,
    systemRoles: string[] = [],
  ) {
    const tournament = await this.getManagedTournamentForCourtSetup(
      tournamentId,
      user.sub,
      systemRoles,
    );
    await this.venuesService.findOne(venueId); // Ensure venue exists
    await this.tournamentsRepository.update(tournamentId, user.sub, {
      venueId,
    });
    return { success: true, defaultVenueId: venueId };
  }

  async deleteTournamentVenue(
    tournamentId: string,
    venueId: string,
    user: JwtPayload,
    systemRoles: string[] = [],
  ) {
    const tournament = await this.getManagedTournamentForCourtSetup(
      tournamentId,
      user.sub,
      systemRoles,
    );
    const config = (tournament.tournamentConfig || {}) as Record<
      string,
      unknown
    >;
    const existingVenueIds = Array.isArray(config.venueIds)
      ? (config.venueIds as string[])
      : [];
    const updatedVenueIds = existingVenueIds.filter((id) => id !== venueId);

    let nextDefaultVenueId = tournament.venueId;
    if (tournament.venueId === venueId) {
      nextDefaultVenueId = updatedVenueIds[0] || null;
    }

    await this.tournamentsRepository.update(tournamentId, user.sub, {
      venueId: nextDefaultVenueId || undefined,
      tournamentConfig: {
        ...config,
        venueIds: updatedVenueIds,
      },
    });

    return {
      success: true,
      remainingVenueIds: updatedVenueIds,
      defaultVenueId: nextDefaultVenueId,
    };
  }

  async saveTournamentVenue(
    tournamentId: string,
    dto: CreateVenueDto,
    user: JwtPayload,
    systemRoles: string[] = [],
  ) {
    const tournament = await this.getManagedTournamentForCourtSetup(
      tournamentId,
      user.sub,
      systemRoles,
    );
    if (tournament.venueId) {
      return this.venuesService.update(tournament.venueId, user.sub, dto);
    }

    const venue = await this.venuesService.create(user.sub, dto);
    await this.tournamentsRepository.update(tournamentId, user.sub, {
      venueId: venue.id,
    });
    return venue;
  }

  async getTournamentCourts(
    tournamentId: string,
    user: JwtPayload,
    systemRoles: string[] = [],
  ) {
    const tournament = await this.getManagedTournamentForCourtSetup(
      tournamentId,
      user.sub,
      systemRoles,
    );
    if (!tournament.venueId) {
      return { venue: null, courts: [] };
    }
    const venue = await this.venuesService.findOne(tournament.venueId);
    return { venue, courts: venue.courts ?? [] };
  }

  async addTournamentCourt(
    tournamentId: string,
    dto: CreateVenueCourtDto,
    user: JwtPayload,
    systemRoles: string[] = [],
  ) {
    const tournament = await this.getManagedTournamentForCourtSetup(
      tournamentId,
      user.sub,
      systemRoles,
    );
    if (!tournament.venueId) {
      throw new BadRequestException(
        'Giải đấu cần lưu địa điểm trước khi thêm sân.',
      );
    }
    return this.venuesService.addCourt(tournament.venueId, dto);
  }

  async addTournamentCourtsBatch(
    tournamentId: string,
    dto: CreateBatchCourtsDto,
    user: JwtPayload,
    systemRoles: string[] = [],
  ) {
    const tournament = await this.getManagedTournamentForCourtSetup(
      tournamentId,
      user.sub,
      systemRoles,
    );
    if (!tournament.venueId) {
      throw new BadRequestException(
        'Giải đấu cần lưu địa điểm trước khi thêm sân.',
      );
    }
    return this.venuesService.addCourtsBatch(
      tournament.venueId,
      dto.courtCount,
      dto.namePrefix,
    );
  }

  async removeTournamentCourt(
    tournamentId: string,
    courtId: string,
    user: JwtPayload,
    systemRoles: string[] = [],
  ) {
    const tournament = await this.getManagedTournamentForCourtSetup(
      tournamentId,
      user.sub,
      systemRoles,
    );
    if (!tournament.venueId) {
      throw new NotFoundException('Giải đấu chưa có địa điểm thi đấu.');
    }
    const venue = await this.venuesService.findOne(tournament.venueId);
    if (!venue.courts?.some((court) => court.id === courtId)) {
      throw new NotFoundException('Court not found in this tournament venue');
    }
    return this.venuesService.removeCourt(tournament.venueId, courtId);
  }

  async addVenueCourtDirect(
    tournamentId: string,
    venueId: string,
    dto: CreateVenueCourtDto,
    user: JwtPayload,
    systemRoles: string[] = [],
  ) {
    await this.getManagedTournamentForCourtSetup(
      tournamentId,
      user.sub,
      systemRoles,
    );
    return this.venuesService.addCourt(venueId, dto);
  }

  async addVenueCourtsBatchDirect(
    tournamentId: string,
    venueId: string,
    dto: CreateBatchCourtsDto,
    user: JwtPayload,
    systemRoles: string[] = [],
  ) {
    await this.getManagedTournamentForCourtSetup(
      tournamentId,
      user.sub,
      systemRoles,
    );
    return this.venuesService.addCourtsBatch(
      venueId,
      dto.courtCount,
      dto.namePrefix,
    );
  }

  async removeVenueCourtDirect(
    tournamentId: string,
    venueId: string,
    courtId: string,
    user: JwtPayload,
    systemRoles: string[] = [],
  ) {
    await this.getManagedTournamentForCourtSetup(
      tournamentId,
      user.sub,
      systemRoles,
    );
    return this.venuesService.removeCourt(venueId, courtId);
  }
}
