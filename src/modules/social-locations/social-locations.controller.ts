import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  IsLatitude,
  IsLongitude,
  Matches,
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SocialLocationsService } from './social-locations.service';

class SearchQuery {
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  @MaxLength(200)
  q!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(8)
  limit = 8;
}

class ResolveBody {
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  @MaxLength(500)
  text!: string;
}

class ReverseQuery {
  @Type(() => Number)
  @IsLatitude()
  lat!: number;

  @Type(() => Number)
  @IsLongitude()
  lon!: number;
}

@ApiTags('social-locations')
@ApiBearerAuth()
@Throttle({ default: { limit: 60, ttl: 30000 } })
@Controller('social-locations')
export class SocialLocationsController {
  constructor(private readonly service: SocialLocationsService) {}

  @Get('search')
  search(@Query() query: SearchQuery) {
    return this.service.search(query.q, query.limit);
  }

  @Post('resolve')
  resolve(@Body() body: ResolveBody) {
    return this.service.resolve(body.text);
  }

  @Get('reverse')
  reverse(@Query() query: ReverseQuery) {
    return this.service.reverse(query.lat, query.lon);
  }
}
