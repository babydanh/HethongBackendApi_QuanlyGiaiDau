import { Injectable } from '@nestjs/common';
import { RegionsRepository } from './regions.repository';
import {
  QueryRegionDto,
  QueryWardDto,
  SearchRegionsDto,
} from './dto/query-region.dto';

@Injectable()
export class RegionsService {
  constructor(private readonly regionsRepository: RegionsRepository) {}

  async getProvinces(query: QueryRegionDto) {
    return this.regionsRepository.findProvinces(query);
  }

  async getWards(query: QueryWardDto) {
    return this.regionsRepository.findWards(query);
  }

  async search(query: SearchRegionsDto) {
    return this.regionsRepository.searchCombined(query);
  }
}
