import { Injectable } from '@nestjs/common';
import { VenuesRepository } from '../venues/venues.repository';

@Injectable()
export class SocialLocationsService {
  constructor(private readonly venuesRepository: VenuesRepository) {}

  search(query: string, limit = 10) {
    return this.venuesRepository.searchSocialVenues(query, limit);
  }
}
