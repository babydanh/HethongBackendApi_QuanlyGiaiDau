import { Controller, Get, GoneException, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { SocialLocationsService } from './social-locations.service';
import { SearchSocialVenuesDto } from './dto/search-social-venues.dto';

@ApiTags('social-locations')
@ApiBearerAuth()
@Controller('social-locations')
export class SocialLocationsController {
  constructor(private readonly service: SocialLocationsService) {}

  @Get('search')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'Tìm venue đã ghim trong danh bạ nội bộ' })
  @ApiResponse({ status: 200, description: 'Danh sách venue có pin, UUID và mã vùng nullable' })
  search(@Query() query: SearchSocialVenuesDto) {
    return this.service.search(query.q, query.limit);
  }

  @Get('reverse')
  @ApiResponse({ status: 410, description: 'LOCATION_PROVIDER_RETIRED; use the internal venue directory and map pin' })
  reverse() {
    throw new GoneException({ code: 'LOCATION_PROVIDER_RETIRED' });
  }

  @Get(':placeId')
  @ApiResponse({ status: 410, description: 'LOCATION_PROVIDER_RETIRED; use GET /venues/:id' })
  detail(@Param('placeId') _placeId: string) {
    throw new GoneException({ code: 'LOCATION_PROVIDER_RETIRED' });
  }
}
