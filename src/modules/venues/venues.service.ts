import { ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { LivestreamService } from '../livestream/livestream.service';
import { VenuesRepository } from './venues.repository';
import { CreateVenueDto } from './dto/create-venue.dto';
import { UpdateVenueDto } from './dto/update-venue.dto';
import { QueryVenueDto } from './dto/query-venue.dto';
import { CreateVenueCourtDto } from './dto/create-venue-court.dto';
import { RegionsService } from '../regions/regions.service';
import { validateCoordinatePair } from '../../common/utils/geo-point';

@Injectable()
export class VenuesService {
  private readonly logger = new Logger(VenuesService.name);

  constructor(
    private readonly venuesRepository: VenuesRepository,
    private readonly regionsService: RegionsService,
    @Optional() private readonly livestreamService?: LivestreamService,
  ) {}

  async findAll(query: QueryVenueDto) {
    return this.venuesRepository.findAll(query);
  }

  async findOne(id: string) {
    const venue = await this.venuesRepository.findByIdWithCoordinates(id);
    if (!venue) {
      throw new NotFoundException('Venue not found');
    }
    const courts = await this.venuesRepository.findCourtsByVenue(id);
    return { ...venue, courts };
  }

  async create(userId: string, createVenueDto: CreateVenueDto) {
    const pair = validateCoordinatePair(createVenueDto.latitude, createVenueDto.longitude);
    const region = pair
      ? await this.regionsService.resolveByPoint({ lat: pair.latitude, lng: pair.longitude })
      : null;
    const result = await this.venuesRepository.create(userId, createVenueDto, undefined, {
      provinceCode: region?.provinceCode ?? null,
      wardCode: region?.wardCode ?? null,
    });
    if ('duplicateCandidates' in result) {
      throw new ConflictException({ code: 'VENUE_DUPLICATE_CANDIDATES', details: { candidates: result.duplicateCandidates } });
    }
    return result;
  }

  async update(id: string, userId: string, updateVenueDto: UpdateVenueDto) {
    const existing = await this.venuesRepository.findById(id);
    if (!existing) throw new NotFoundException('Venue not found');
    if (existing.ownerUserId !== userId) throw new ForbiddenException({ code: 'VENUE_OWNER_REQUIRED' });
    const updated = await this.venuesRepository.update(id, userId, updateVenueDto);
    if (!updated) throw new ForbiddenException({ code: 'VENUE_OWNER_REQUIRED' });
    return updated;
  }

  async remove(id: string, userId: string) {
    const existing = await this.venuesRepository.findById(id);
    if (!existing) throw new NotFoundException('Venue not found');
    if (existing.ownerUserId !== userId) throw new ForbiddenException({ code: 'VENUE_OWNER_REQUIRED' });
    const deleted = await this.venuesRepository.delete(id, userId);
    if (!deleted) throw new ForbiddenException({ code: 'VENUE_OWNER_REQUIRED' });
    return deleted;
  }

  // --- COURTS ---
  private async requireOwner(venueId: string, userId: string) {
    const existing = await this.venuesRepository.findById(venueId);
    if (!existing) throw new NotFoundException('Venue not found');
    if (existing.ownerUserId !== userId) throw new ForbiddenException({ code: 'VENUE_OWNER_REQUIRED' });
  }

  async addCourt(venueId: string, userId: string, createVenueCourtDto: CreateVenueCourtDto) {
    await this.requireOwner(venueId, userId);
    return this.venuesRepository.addCourt(venueId, createVenueCourtDto);
  }

  async addCourtsBatch(venueId: string, userId: string, courtCount: number, namePrefix = 'Sân') {
    await this.requireOwner(venueId, userId);
    return this.venuesRepository.addCourtsBatch(venueId, courtCount, namePrefix);
  }

  async removeCourt(venueId: string, userId: string, courtId: string) {
    await this.requireOwner(venueId, userId);
    const court = await this.venuesRepository.findCourtByVenue(venueId, courtId);
    if (!court) throw new NotFoundException('Court not found');
    // Dọn camera của sân TRƯỚC khi xoá: `livestream_cameras.court_id` là
    // ON DELETE SET NULL nên xoá xong sẽ không tìm lại được camera để gỡ.
    // Lỗi dọn không được chặn việc xoá sân, nếu không BTC không xoá được sân.
    if (this.livestreamService) {
      try {
        const detached = await this.livestreamService.detachCamerasForCourt(courtId);
        if (detached > 0) {
          this.logger.warn(
            `Xoá sân ${courtId}: đã gỡ ${detached} camera livestream khỏi các trận dùng nó.`,
          );
        }
      } catch (err) {
        this.logger.warn(
          `Xoá sân ${courtId}: không dọn được camera livestream: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    const deleted = await this.venuesRepository.removeCourt(venueId, courtId);
    if (!deleted) throw new NotFoundException('Court not found');
    return deleted;
  }
}
