import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
import { NearbySocialsQueryDto } from './dto/nearby-socials.dto';
import { SocialSessionsService } from './social-sessions.service';

@ApiTags('socials')
@Controller('socials')
export class NearbySocialsController {
  constructor(private readonly service: SocialSessionsService) {}

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get('nearby')
  @ApiOperation({ summary: 'Social công khai sắp bắt đầu gần điểm tham chiếu (phân trang page/limit)' })
  @ApiResponse({ status: 200, description: 'data.items có distanceMeters; data.meta có page, limit, total' })
  @ApiResponse({ status: 400, description: 'NEARBY_CURSOR_RETIRED khi cursor cũ không rỗng' })
  nearby(@Query() query: NearbySocialsQueryDto) {
    return this.service.nearbyLegacy(query);
  }
}
