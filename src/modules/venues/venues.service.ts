import { Injectable, NotFoundException } from '@nestjs/common';
import { VenuesRepository } from './venues.repository';
import { CreateVenueDto } from './dto/create-venue.dto';
import { UpdateVenueDto } from './dto/update-venue.dto';
import { QueryVenueDto } from './dto/query-venue.dto';
import { CreateVenueCourtDto } from './dto/create-venue-court.dto';

@Injectable()
export class VenuesService {
  constructor(private readonly venuesRepository: VenuesRepository) {}

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
    const existing = await this.venuesRepository.findById(venueId);
    if (!existing) throw new NotFoundException('Venue not found');
    const deleted = await this.venuesRepository.removeCourt(courtId);
    if (!deleted) throw new NotFoundException('Court not found');
    return deleted;
  }
}
