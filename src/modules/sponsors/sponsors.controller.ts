import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CreateSponsorDto } from './dto/create-sponsor.dto';
import { UpdateSponsorDto } from './dto/update-sponsor.dto';
import { SponsorsService } from './sponsors.service';

@ApiTags('tournament-sponsors')
@Controller('tournaments/:tournamentId/sponsors')
export class SponsorsController {
  constructor(private readonly sponsorsService: SponsorsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List effective public sponsors for a tournament' })
  async listPublic(@Param('tournamentId', ParseUUIDPipe) tournamentId: string) {
    return this.sponsorsService.listPublic(tournamentId);
  }

  @Get('manage')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all non-deleted sponsors for an organizer' })
  async listForOrganizer(
    @Param('tournamentId', ParseUUIDPipe) tournamentId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.sponsorsService.listForOrganizer(tournamentId, user);
  }

  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a sponsor for a tournament' })
  async create(
    @Param('tournamentId', ParseUUIDPipe) tournamentId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateSponsorDto,
  ) {
    return this.sponsorsService.create(tournamentId, user, dto);
  }

  @Patch(':sponsorId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a tournament sponsor' })
  async update(
    @Param('tournamentId', ParseUUIDPipe) tournamentId: string,
    @Param('sponsorId', ParseUUIDPipe) sponsorId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateSponsorDto,
  ) {
    return this.sponsorsService.update(tournamentId, sponsorId, user, dto);
  }

  @Delete(':sponsorId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Archive a tournament sponsor' })
  async archive(
    @Param('tournamentId', ParseUUIDPipe) tournamentId: string,
    @Param('sponsorId', ParseUUIDPipe) sponsorId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.sponsorsService.archive(tournamentId, sponsorId, user);
  }
}
