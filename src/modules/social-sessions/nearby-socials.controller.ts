import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
import { NearbySocialsQueryDto } from './dto/nearby-socials.dto';
import { SocialSessionsService } from './social-sessions.service';

@ApiTags('socials')
@Controller('socials')
export class NearbySocialsController {
  constructor(private readonly service: SocialSessionsService) {}

  @Public() @UseGuards(OptionalJwtAuthGuard) @Get('nearby')
  nearby(@Query() query: NearbySocialsQueryDto) {
    return this.service.nearby(query);
  }
}
