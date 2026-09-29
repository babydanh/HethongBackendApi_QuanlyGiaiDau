import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { RegionsService } from './regions.service';
import {
  QueryCentroidDto,
  QueryRegionDto,
  QueryResolveDto,
  QueryWardDto,
  ResolvedRegionDto,
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
  @Get('resolve')
  @ApiOperation({ summary: 'Tra phường chứa một điểm toạ độ' })
  @ApiResponse({
    status: 200,
    description:
      'Phường chứa điểm, hoặc null khi điểm nằm ngoài vùng có ranh giới. ' +
      'isEstimated=true nghĩa là phường tìm bằng khoảng cách tới tâm gần ' +
      'nhất, không phải phường chứa điểm — client không nên tự điền ' +
      'tỉnh/phường từ kết quả đó.',
    type: ResolvedRegionDto,
  })
  async resolve(@Query() query: QueryResolveDto) {
    return this.regionsService.resolveByPoint(query);
  }

  @Public()
  @Get('wards/centroid')
  @ApiOperation({ summary: 'Lấy tâm hình học của một phường' })
  @ApiResponse({
    status: 200,
    description:
      'Thông tin phường kèm toạ độ tâm (luôn là ước lượng, isEstimated=true), ' +
      'hoặc null khi mã không tồn tại',
    type: ResolvedRegionDto,
  })
  async getCentroid(@Query() query: QueryCentroidDto) {
    return this.regionsService.getCentroid(query);
  }
}
