import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
import {
  AddSocialParticipantDto,
  JoinSocialSessionDto,
  QuerySocialSessionsDto,
  CreateSocialSessionDto,
  UpdateSocialPaymentDto,
  UpdateSocialSessionDto,
} from './dto/social-session.dto';
import { SocialSessionsService } from './social-sessions.service';

type RequestUser = { id: string; roles?: string[] };

@ApiTags('social-sessions')
@ApiBearerAuth()
@Controller('social-sessions')
export class SocialSessionsController {
  constructor(private readonly service: SocialSessionsService) {}

  @Post()
  create(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateSocialSessionDto,
  ) {
    return this.service.create(user, dto);
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get()
  list(
    @Query() query: QuerySocialSessionsDto,
    @CurrentUser() user?: RequestUser,
  ) {
    return this.service.list(query, user?.id);
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id')
  getById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user?: RequestUser,
  ) {
    return this.service.getById(id, user?.id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSocialSessionDto,
  ) {
    return this.service.update(user, id, dto);
  }

  @Delete(':id')
  cancel(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.cancel(user, id);
  }

  @Post(':id/join')
  join(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: JoinSocialSessionDto,
  ) {
    return this.service.join(user, id, dto);
  }

  @Post(':id/participants')
  addParticipant(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddSocialParticipantDto,
  ) {
    return this.service.addParticipant(user, id, dto);
  }

  @Delete(':id/participants/:userId')
  removeParticipant(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.service.removeParticipant(user, id, userId);
  }

  @Patch(':id/participants/:userId/payment')
  updatePayment(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: UpdateSocialPaymentDto,
  ) {
    return this.service.updatePayment(user, id, userId, dto);
  }
}
