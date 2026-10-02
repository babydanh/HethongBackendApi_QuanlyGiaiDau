import { Injectable } from '@nestjs/common';
import { RegionsRepository } from './regions.repository';
import type { AppDbOrTx } from '../../database/db.types';
import {
  QueryCentroidDto,
  QueryRegionDto,
  QueryResolveDto,
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

  /**
   * Cả hai tra cứu dưới đây trả null thay vì ném lỗi: điểm nằm ngoài vùng có
   * ranh giới là nhánh bình thường, không phải 500.
   */
  async resolveByPoint(query: QueryResolveDto, executor?: AppDbOrTx) {
    return this.regionsRepository.resolveByPoint(query, executor);
  }

  async getCentroid(query: QueryCentroidDto) {
    return this.regionsRepository.findCentroid(query);
  }

}
