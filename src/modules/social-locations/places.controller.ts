import { BadRequestException, Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { IsInt, IsLatitude, IsLongitude, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { SocialLocationsService } from './social-locations.service';

class AutocompleteQuery {
  @IsString() @IsNotEmpty() @Matches(/\S/) @MaxLength(200)
  q!: string;

  @Type(() => Number) @IsOptional() @IsInt() @Min(1) @Max(8)
  limit = 8;

  @Type(() => Number) @IsOptional() @IsLatitude()
  lat?: number;

  @Type(() => Number) @IsOptional() @IsLongitude()
  lng?: number;
}

class ReverseQuery {
  @Type(() => Number) @IsLatitude()
  lat!: number;
  @Type(() => Number) @IsLongitude()
  lng!: number;
}

@ApiTags('places')
@ApiBearerAuth()
@Throttle({ default: { limit: 30, ttl: 60000 } })
@Controller('places')
export class PlacesController {
  constructor(private readonly service: SocialLocationsService) {}

  @Get('autocomplete')
  autocomplete(@Query() query: AutocompleteQuery) {
    if ((query.lat === undefined) !== (query.lng === undefined)) {
      throw new BadRequestException({ code: 'LOCATION_PAIR_REQUIRED' });
    }
    return this.service.autocomplete(query.q, query.limit,
      query.lat === undefined ? undefined : { lat: query.lat, lng: query.lng! });
  }

  @Get('reverse')
  reverse(@Query() query: ReverseQuery) {
    return this.service.reversePlace(query.lat, query.lng);
  }

  @Get(':placeId')
  detail(@Param('placeId') placeId: string) {
    return this.service.detail(placeId);
  }
}
