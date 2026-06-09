import { Injectable } from '@nestjs/common';
import { RegionsRepository } from './regions.repository';
import { QueryRegionDto, QueryDistrictDto, QueryWardDto } from './dto/query-region.dto';

@Injectable()
export class RegionsService {
  constructor(private readonly regionsRepository: RegionsRepository) {}

  async getProvinces(query: QueryRegionDto) {
    return this.regionsRepository.findProvinces(query);
  }

  async getDistricts(query: QueryDistrictDto) {
    return this.regionsRepository.findDistricts(query);
  }

  async getWards(query: QueryWardDto) {
    return this.regionsRepository.findWards(query);
  }
}
