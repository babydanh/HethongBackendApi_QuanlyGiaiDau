import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
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
  AddSocialParticipantsBatchDto,
  JoinSocialSessionDto,
  QuerySocialByCommunityDto,
  QuerySocialJoinRequestsDto,
  QuerySocialSessionsDto,
  CreateSocialSessionDto,
  SendSocialMessageDto,
  UpdateSocialPaymentDto,
  UpdateSocialSessionDto,
} from './dto/social-session.dto';
import { QueryChatMessagesDto } from '../chat/dto/query-chat-messages.dto';
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
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.service.create(user, dto, idempotencyKey);
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get()
  list(
    @Query() query: QuerySocialSessionsDto,
    @CurrentUser() user?: RequestUser,
  ) {
    return this.service.list(query, user?.id, user?.roles);
  }

  // Khai báo trước ':id' để không bị ParseUUIDPipe của route param nuốt.
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get('short/:code')
  getByShortCode(@Param('code') code: string) {
    return this.service.getByShortCode(code);
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get('by-community/:communityId')
  listByCommunity(
    @Param('communityId', ParseUUIDPipe) communityId: string,
    @Query() query: QuerySocialByCommunityDto,
    @CurrentUser() user?: RequestUser,
  ) {
    return this.service.listByCommunity(user, communityId, query);
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id')
  getById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user?: RequestUser,
  ) {
    return this.service.getById(id, user?.id, user?.roles);
  }
  @Post(':id/requests')
  requestToJoin(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto?: JoinSocialSessionDto,
  ) {
    return this.service.requestToJoin(user, id, dto?.ticketCount);
  }

  @Get(':id/requests')
  listJoinRequests(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: QuerySocialJoinRequestsDto,
  ) {
    return this.service.listJoinRequests(user, id, query);
  }

  @Post(':id/requests/:participantId/approve')
  approveJoinRequest(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('participantId', ParseUUIDPipe) participantId: string,
  ) {
    return this.service.approveJoinRequest(user, id, participantId);
  }

  @Post(':id/requests/:participantId/reject')
  rejectJoinRequest(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('participantId', ParseUUIDPipe) participantId: string,
  ) {
    return this.service.rejectJoinRequest(user, id, participantId);
  }

  @Delete(':id/requests/self')
  withdrawJoinRequest(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.withdrawJoinRequest(user, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSocialSessionDto,
  ) {
    return this.service.update(user, id, dto);
  }

  /** Bước 1 — Hủy kèo: đánh dấu CANCELLED (vẫn xem được detail). */
  @Patch(':id/cancel')
  cancel(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.cancel(user, id);
  }

  /** Bước 2 — Xóa kèo: xóa cứng hoàn toàn (chỉ sau khi đã CANCELLED). */
  @Delete(':id')
  remove(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.remove(user, id);
  }

  @Get(':id/messages')
  getSocialMessages(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: QueryChatMessagesDto,
  ) {
    return this.service.getSocialMessages(user, id, query.limit, query.cursor);
  }

  @Post(':id/messages')
  sendSocialMessage(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendSocialMessageDto,
  ) {
    return this.service.sendSocialMessage(user, id, dto);
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

  @Post(':id/participants/batch')
  addParticipantsBatch(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddSocialParticipantsBatchDto,
  ) {
    return this.service.addParticipantsBatch(user, id, dto);
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
