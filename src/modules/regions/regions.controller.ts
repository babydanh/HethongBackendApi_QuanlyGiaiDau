import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { RegionsService } from './regions.service';
import { QueryRegionDto, QueryDistrictDto, QueryWardDto } from './dto/query-region.dto';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('regions')
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
  @Get('districts')
  @ApiOperation({ summary: 'Lấy danh sách quận/huyện theo tỉnh' })
  @ApiResponse({ status: 200, description: 'Danh sách quận/huyện' })
  async getDistricts(@Query() query: QueryDistrictDto) {
    return this.regionsService.getDistricts(query);
  }

  @Public()
  @Get('wards')
  @ApiOperation({ summary: 'Lấy danh sách phường/xã theo quận/huyện' })
  @ApiResponse({ status: 200, description: 'Danh sách phường/xã' })
  async getWards(@Query() query: QueryWardDto) {
    return this.regionsService.getWards(query);
  }
}
