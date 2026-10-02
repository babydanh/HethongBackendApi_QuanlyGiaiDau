import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { RegionsService } from './regions.service';
import {
  QueryCentroidDto,
  QueryRegionDto,
  QueryResolveDto,
  QueryWardDto,
  ResolvedRegionDto,
  SearchRegionsDto,
} from './dto/query-region.dto';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('regions')
@Public()
@Controller('regions')
export class RegionsController {
  constructor(private readonly regionsService: RegionsService) {}

  @Public()
  @Get('provinces')
  @ApiOperation({ summary: 'Lấy danh sách tỉnh/thành phố' })
  @ApiResponse({ status: 200, description: 'Danh sách tỉnh/thành phố' })
  async getProvinces(@Query() query: QueryRegionDto) {
    return this.regionsService.getProvinces(query);
  }

  @Public()
  @Get('wards')
  @ApiOperation({ summary: 'Lấy danh sách phường/xã trực thuộc tỉnh/thành phố' })
  @ApiResponse({ status: 200, description: 'Danh sách phường/xã' })
  async getWards(@Query() query: QueryWardDto) {
    return this.regionsService.getWards(query);
  }

  @Public()
  @Get('search')
  @ApiOperation({ summary: 'Tìm kiếm kết hợp tỉnh/thành và phường/xã' })
  @ApiResponse({ status: 200, description: 'Kết quả khu vực hành chính' })
  async search(@Query() query: SearchRegionsDto) {
    return this.regionsService.search(query);
  }

  @Public()
  @Get('resolve')
  @ApiOperation({ summary: 'Tra phường có polygon bao phủ điểm; trả null nếu chưa có polygon phù hợp' })
  @ApiResponse({
    status: 200,
    description: 'Chỉ polygon được ST_Covers trả về region; ngoài polygon hoặc boundary chưa nạp thì trả null.',
    type: ResolvedRegionDto,
  })
  async resolve(@Query() query: QueryResolveDto) {
    return this.regionsService.resolveByPoint(query);
  }

  @Public()
  @Get('wards/centroid')
  @ApiOperation({ summary: 'Lấy tâm tham chiếu nullable từ danh mục wards' })
  @ApiResponse({
    status: 200,
    description: 'Center lấy từ wards.center_lat/center_lng; trả null nếu mã không khớp hoặc thiếu center.',
    type: ResolvedRegionDto,
  })
  async getCentroid(@Query() query: QueryCentroidDto) {
    return this.regionsService.getCentroid(query);
  }
}
