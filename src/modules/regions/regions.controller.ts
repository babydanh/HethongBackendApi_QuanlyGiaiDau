import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { RegionsService } from './regions.service';
import { QueryRegionDto, QueryWardDto } from './dto/query-region.dto';
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
}
