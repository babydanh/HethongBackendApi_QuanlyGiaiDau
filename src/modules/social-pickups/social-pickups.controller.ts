import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { CreateSocialPickupDto } from './dto/create-social-pickup.dto';
import { QuerySocialPickupsDto } from './dto/query-social-pickups.dto';
import { SocialPickupsService } from './social-pickups.service';

type RequestUser = { id: string; roles?: string[] };

@ApiTags('social-pickups')
@ApiBearerAuth()
@Controller('social/pickups')
export class SocialPickupsController {
  constructor(private readonly service: SocialPickupsService) {}

  @Post()
  @UseGuards(new RateLimitGuard(20, 60_000))
  create(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateSocialPickupDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.service.create(user, dto, idempotencyKey);
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get()
  list(@Query() query: QuerySocialPickupsDto, @CurrentUser() user?: RequestUser) {
    return this.service.list(query, user);
  }

  @Get('mine')
  mine(@CurrentUser() user: RequestUser) {
    return this.service.listMine(user);
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id')
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user?: RequestUser,
  ) {
    return this.service.get(id, user);
  }

  @Get(':id/participants/me')
  getMyParticipant(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.getMyParticipant(id, user);
  }

  @Post(':id/participants/self')
  @UseGuards(new RateLimitGuard(30, 60_000))
  join(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.join(id, user);
  }

  @Delete(':id/participants/self')
  @UseGuards(new RateLimitGuard(30, 60_000))
  withdraw(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.withdraw(id, user);
  }

  @Post(':id/cancel')
  @UseGuards(new RateLimitGuard(20, 60_000))
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.cancel(id, user);
  }
}
