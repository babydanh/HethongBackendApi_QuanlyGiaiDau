import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { LivestreamService } from '../livestream/livestream.service';
import { VenuesRepository } from './venues.repository';
import { CreateVenueDto } from './dto/create-venue.dto';
import { UpdateVenueDto } from './dto/update-venue.dto';
import { QueryVenueDto } from './dto/query-venue.dto';
import { CreateVenueCourtDto } from './dto/create-venue-court.dto';

@Injectable()
export class VenuesService {
  private readonly logger = new Logger(VenuesService.name);

  constructor(
    private readonly venuesRepository: VenuesRepository,
    @Optional() private readonly livestreamService?: LivestreamService,
  ) {}

  async findAll(query: QueryVenueDto) {
    return this.venuesRepository.findAll(query);
  }

  async findOne(id: string) {
    const venue = await this.venuesRepository.findById(id);
    if (!venue) {
      throw new NotFoundException('Venue not found');
    }
    const courts = await this.venuesRepository.findCourtsByVenue(id);
    return { ...venue, courts };
  }

  async create(userId: string, createVenueDto: CreateVenueDto) {
    return this.venuesRepository.create(userId, createVenueDto);
  }

  async update(id: string, userId: string, updateVenueDto: UpdateVenueDto) {
    const existing = await this.venuesRepository.findById(id);
    if (!existing) throw new NotFoundException('Venue not found');
    return this.venuesRepository.update(id, userId, updateVenueDto);
  }

  async remove(id: string) {
    const existing = await this.venuesRepository.findById(id);
    if (!existing) throw new NotFoundException('Venue not found');
    return this.venuesRepository.delete(id);
  }

  // --- COURTS ---
  async addCourt(venueId: string, createVenueCourtDto: CreateVenueCourtDto) {
    const existing = await this.venuesRepository.findById(venueId);
    if (!existing) throw new NotFoundException('Venue not found');
    return this.venuesRepository.addCourt(venueId, createVenueCourtDto);
  }

  async addCourtsBatch(venueId: string, courtCount: number, namePrefix = 'Sân') {
    const existing = await this.venuesRepository.findById(venueId);
    if (!existing) throw new NotFoundException('Venue not found');
    return this.venuesRepository.addCourtsBatch(venueId, courtCount, namePrefix);
  }

  async removeCourt(venueId: string, courtId: string) {
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

    const deleted = await this.venuesRepository.removeCourt(courtId);
    if (!deleted) throw new NotFoundException('Court not found');
    return deleted;
  }
}
