import { Injectable, Logger } from '@nestjs/common';
import { TournamentsService } from '../tournaments/tournaments.service';
import { CommunitiesService } from '../communities/communities.service';
import { MatchesService } from '../matches/matches.service';
import { RankingsService } from '../rankings/rankings.service';
import { QueryMatchDto } from '../matches/dto/query-match.dto';
import { AiToolRegistry } from './ai-tool.registry';
import type {
  AiToolContext,
  AiToolEvent,
  AiToolPagination,
  AiToolResultEnvelope,
  AiToolResultStatus,
  AiUiBlock,
} from './ai-tool.types';

@Injectable()
export class AiToolRouter {
  private readonly logger = new Logger(AiToolRouter.name);

  constructor(
    private readonly registry: AiToolRegistry,
    private readonly tournamentsService: TournamentsService,
    private readonly communitiesService: CommunitiesService,
    private readonly matchesService: MatchesService,
    private readonly rankingsService: RankingsService,
  ) {}

  getDefinitions() {
    return this.registry.getOpenAiTools();
  }

  labelFor(name: string): string {
    const labels: Record<string, string> = {
      get_my_registrations: 'Đang kiểm tra các giải bạn đã đăng ký',
      get_my_created_tournaments: 'Đang kiểm tra các giải bạn đã tạo',
      get_my_managed_tournaments: 'Đang kiểm tra các giải bạn đang quản lý',
      get_my_communities: 'Đang kiểm tra các CLB của bạn',
      get_my_invitations: 'Đang kiểm tra lời mời CLB',
      get_my_upcoming_matches: 'Đang kiểm tra các trận sắp tới',
      get_my_rankings: 'Đang kiểm tra xếp hạng của bạn',
      get_tournament_registration_status: 'Đang kiểm tra trạng thái đăng ký giải',
    };
    return labels[name] || 'Đang kiểm tra dữ liệu';
  }

  async execute(name: string, rawArguments: string | null | undefined, context: AiToolContext): Promise<AiToolResultEnvelope> {
    const definition = this.registry.get(name);
    if (!definition) {
      return this.error('VALIDATION_ERROR', 'UNKNOWN_TOOL', context);
    }
    if (definition.requiresAuth && !context.userId) {
      return this.error('AUTH_REQUIRED', 'AUTH_REQUIRED', context);
    }

    let args: Record<string, unknown>;
    try {
      args = this.registry.parseArguments(name, rawArguments);
    } catch (error: any) {
      return this.error('VALIDATION_ERROR', 'INVALID_ARGUMENTS', context, error.message);
    }

    try {
      switch (name) {
        case 'get_my_registrations':
          return await this.getMyRegistrations(args, context);
        case 'get_my_created_tournaments':
          return await this.getMyCreatedTournaments(args, context);
        case 'get_my_managed_tournaments':
          return await this.getMyManagedTournaments(args, context);
        case 'get_my_communities':
          return await this.getMyCommunities(context);
        case 'get_my_invitations':
          return await this.getMyInvitations(context);
        case 'get_my_upcoming_matches':
          return await this.getMyUpcomingMatches(args, context);
        case 'get_my_rankings':
          return await this.getMyRankings(context);
        case 'get_tournament_registration_status':
          return await this.getTournamentRegistrationStatus(args, context);
        default:
          return this.error('VALIDATION_ERROR', 'UNKNOWN_TOOL', context);
      }
    } catch (error: any) {
      this.logger.warn(`AI tool ${name} failed: ${error?.message || 'unknown error'}`);
      return this.error('UPSTREAM_ERROR', 'TOOL_EXECUTION_FAILED', context);
    }
  }

  private now(): string {
    return new Date().toISOString();
  }

  private envelope<T>(
    status: AiToolResultStatus,
    data: T,
    context: AiToolContext,
    uiBlocks: AiUiBlock[] = [],
    pagination?: AiToolPagination,
    errorCode: string | null = null,
    nextActions: string[] = [],
  ): AiToolResultEnvelope<T> {
    return {
      status,
      data,
      viewer: { authenticated: Boolean(context.userId) },
      dataAsOf: this.now(),
      permissions: {},
      ...(pagination ? { pagination } : {}),
      errorCode,
      nextActions,
      ...(uiBlocks.length > 0 ? { uiBlocks } : {}),
    };
  }

  private error(
    status: AiToolResultStatus,
    errorCode: string,
    context: AiToolContext,
    detail?: string,
  ): AiToolResultEnvelope {
    return this.envelope(status, { message: detail || null }, context, [{
      type: 'error',
      id: `error-${errorCode.toLowerCase()}`,
      title: status === 'AUTH_REQUIRED' ? 'Cần đăng nhập' : 'Không thể tải dữ liệu',
      data: { code: errorCode },
      actions: status === 'UPSTREAM_ERROR' ? [{ label: 'Thử lại', action: 'retry', intent: 'primary' }] : [],
    }], undefined, errorCode, status === 'AUTH_REQUIRED' ? ['LOGIN'] : []);
  }

  private list<T>(value: unknown): T[] {
    if (Array.isArray(value)) return value as T[];
    if (value && typeof value === 'object') {
      const object = value as Record<string, unknown>;
      if (Array.isArray(object.data)) return object.data as T[];
      if (Array.isArray(object.items)) return object.items as T[];
    }
    return [];
  }

  private pageArgs(args: Record<string, unknown>): { page: number; pageSize: number } {
    return {
      page: typeof args.page === 'number' ? args.page : 1,
      pageSize: typeof args.pageSize === 'number' ? args.pageSize : 10,
    };
  }

  private filterByStatus<T extends { status?: string }>(items: T[], status?: unknown): T[] {
    if (!status || status === 'all') return items;
    if (status === 'active') return items.filter((item) => ['UPCOMING', 'REGISTRATION_OPEN', 'IN_PROGRESS'].includes(item.status || ''));
    if (status === 'completed') return items.filter((item) => item.status === 'COMPLETED');
    if (status === 'cancelled') return items.filter((item) => item.status === 'CANCELLED');
    return items.filter((item) => item.status === status);
  }

  private paginate<T>(items: T[], page: number, pageSize: number): { items: T[]; pagination: AiToolPagination } {
    const start = (page - 1) * pageSize;
    return {
      items: items.slice(start, start + pageSize),
      pagination: { page, pageSize, total: items.length, hasNextPage: start + pageSize < items.length },
    };
  }

  private tournamentCard(tournament: any, type: 'registration' | 'tournament' = 'tournament', extra: Record<string, unknown> = {}): AiUiBlock {
    const id = String(tournament?.id || `tournament-${Math.random().toString(36).slice(2)}`);
    return {
      type,
      id,
      title: tournament?.name || 'Giải đấu',
      data: {
        tournamentId: tournament?.id,
        name: tournament?.name || 'Giải đấu',
        sport: tournament?.category?.name || tournament?.sport || 'Chưa xác định',
        status: tournament?.status || 'UNKNOWN',
        startDate: tournament?.startDate || null,
        endDate: tournament?.endDate || null,
        venue: tournament?.venue?.name || tournament?.venueName || null,
        maxParticipants: tournament?.maxParticipants ?? null,
        ...extra,
      },
      actions: tournament?.id ? [{ label: 'Xem giải', action: 'navigate', href: `/tournaments/${tournament.id}`, intent: 'primary' }] : [],
    };
  }

  private communityCard(community: any, role?: string): AiUiBlock {
    const id = String(community?.id || `community-${Math.random().toString(36).slice(2)}`);
    return {
      type: 'community',
      id,
      title: community?.name || 'CLB',
      data: {
        communityId: community?.id,
        name: community?.name || 'CLB',
        logoUrl: community?.logoUrl || community?.avatarUrl || null,
        visibility: community?.visibility || null,
        joinMode: community?.joinMode || null,
        memberCount: community?._count?.members ?? community?.memberCount ?? null,
        membershipRole: role || community?.myRole || null,
        category: community?.category?.name || community?.categoryName || null,
      },
      actions: community?.id ? [{ label: 'Xem CLB', action: 'navigate', href: `/communities/${community.id}`, intent: 'primary' }] : [],
    };
  }

  private matchCard(match: any): AiUiBlock {
    const id = String(match?.id || `match-${Math.random().toString(36).slice(2)}`);
    return {
      type: 'match',
      id,
      title: `${match?.participant1?.teamName || 'TBD'} vs ${match?.participant2?.teamName || 'TBD'}`,
      data: {
        matchId: match?.id,
        scheduledAt: match?.scheduledAt || null,
        status: match?.status || null,
        court: match?.court?.name || match?.courtName || null,
        tournamentName: match?.tournament?.name || null,
        round: match?.round || match?.roundName || null,
      },
      actions: match?.id ? [{ label: 'Xem trận', action: 'navigate', href: `/matches/${match.id}`, intent: 'primary' }] : [],
    };
  }

  private invitationCard(invitation: any): AiUiBlock {
    const id = String(invitation?.id || `invitation-${Math.random().toString(36).slice(2)}`);
    return {
      type: 'invitation',
      id,
      title: invitation?.community?.name || invitation?.communityName || 'Lời mời vào CLB',
      data: {
        invitationId: invitation?.id,
        communityId: invitation?.communityId || invitation?.community?.id || null,
        communityName: invitation?.community?.name || invitation?.communityName || null,
        status: invitation?.status || 'PENDING',
        expiresAt: invitation?.expiresAt || invitation?.expiredAt || null,
      },
      actions: invitation?.communityId ? [{ label: 'Xem CLB', action: 'navigate', href: `/communities/${invitation.communityId}`, intent: 'primary' }] : [],
    };
  }

  private async getMyRegistrations(args: Record<string, unknown>, context: AiToolContext): Promise<AiToolResultEnvelope> {
    const workspace = await this.tournamentsService.getMyWorkspace(context.userId!);
    let items = this.filterByStatus(this.list<any>(workspace?.participatingTournaments), args.status);
    const page = this.pageArgs(args);
    const result = this.paginate(items, page.page, page.pageSize);
    const blocks = result.items.map((item) => this.tournamentCard(item, 'registration', { registrationStatus: 'REGISTERED' }));
    return this.envelope(blocks.length ? 'SUCCESS' : 'EMPTY_RESULT', { items: result.items.map((item) => this.compactTournament(item)) }, context, blocks, result.pagination, null, blocks.length ? [] : ['BROWSE_TOURNAMENTS']);
  }

  private async getMyCreatedTournaments(args: Record<string, unknown>, context: AiToolContext): Promise<AiToolResultEnvelope> {
    let items = this.filterByStatus(this.list<any>(await this.tournamentsService.findMy(context.userId!)), args.status);
    const page = this.pageArgs(args);
    const result = this.paginate(items, page.page, page.pageSize);
    const blocks = result.items.map((item) => this.tournamentCard(item));
    return this.envelope(blocks.length ? 'SUCCESS' : 'EMPTY_RESULT', { items: result.items.map((item) => this.compactTournament(item)) }, context, blocks, result.pagination, null, blocks.length ? [] : ['CREATE_TOURNAMENT']);
  }

  private async getMyManagedTournaments(args: Record<string, unknown>, context: AiToolContext): Promise<AiToolResultEnvelope> {
    const workspace = await this.tournamentsService.getMyWorkspace(context.userId!);
    const role = args.role || 'all';
    const sources = role === 'organizer' ? workspace?.organizedTournaments : role === 'co_organizer' ? workspace?.coOrganizerTournaments : role === 'referee' ? workspace?.refereeTournaments : [
      ...this.list<any>(workspace?.organizedTournaments),
      ...this.list<any>(workspace?.coOrganizerTournaments),
      ...this.list<any>(workspace?.refereeTournaments),
    ];
    const unique = Array.from(new Map(this.filterByStatus(this.list<any>(sources), args.status).map((item) => [item.id, item])).values());
    const page = this.pageArgs(args);
    const result = this.paginate(unique, page.page, page.pageSize);
    const blocks = result.items.map((item) => this.tournamentCard(item));
    return this.envelope(blocks.length ? 'SUCCESS' : 'EMPTY_RESULT', { items: result.items.map((item) => this.compactTournament(item)) }, context, blocks, result.pagination, null, blocks.length ? [] : ['CREATE_TOURNAMENT']);
  }

  private async getMyCommunities(context: AiToolContext): Promise<AiToolResultEnvelope> {
    const result = await this.communitiesService.findMyCommunities(context.userId!);
    const created = this.list<any>(result?.created).map((item) => ({ item, role: 'OWNER' }));
    const joined = this.list<any>(result?.joined).map((item) => ({ item, role: item.myRole || 'MEMBER' }));
    const unique = Array.from(new Map([...created, ...joined].map((entry) => [entry.item.id, entry])).values());
    const blocks = unique.map((entry) => this.communityCard(entry.item, entry.role));
    return this.envelope(blocks.length ? 'SUCCESS' : 'EMPTY_RESULT', { items: unique.map((entry) => ({ ...this.compactCommunity(entry.item), membershipRole: entry.role })) }, context, blocks, { page: 1, pageSize: unique.length || 10, total: unique.length, hasNextPage: false }, null, blocks.length ? [] : ['SEARCH_COMMUNITIES']);
  }

  private async getMyInvitations(context: AiToolContext): Promise<AiToolResultEnvelope> {
    const items = this.list<any>(await this.communitiesService.getMyInvites(context.userId!));
    const blocks = items.map((item) => this.invitationCard(item));
    return this.envelope(blocks.length ? 'SUCCESS' : 'EMPTY_RESULT', { items: items.map((item) => ({ id: item.id, communityId: item.communityId || item.community?.id || null, communityName: item.community?.name || item.communityName || null, status: item.status || 'PENDING', expiresAt: item.expiresAt || item.expiredAt || null })) }, context, blocks, { page: 1, pageSize: items.length || 10, total: items.length, hasNextPage: false }, null, blocks.length ? [] : ['BROWSE_COMMUNITIES']);
  }

  private async getMyUpcomingMatches(args: Record<string, unknown>, context: AiToolContext): Promise<AiToolResultEnvelope> {
    const query = new QueryMatchDto();
    query.userId = context.userId!;
    query.status = args.status === 'all' ? 'SCHEDULED' : String(args.status || 'SCHEDULED');
    if (typeof args.from === 'string') query.startDate = args.from;
    if (typeof args.to === 'string') query.endDate = args.to;
    const response = await this.matchesService.findAll(query);
    const items = this.list<any>(response).filter((item) => item.status === 'SCHEDULED' || item.status === 'UPCOMING');
    const page = this.pageArgs(args);
    const result = this.paginate(items, page.page, page.pageSize);
    const blocks = result.items.map((item) => this.matchCard(item));
    return this.envelope(blocks.length ? 'SUCCESS' : 'EMPTY_RESULT', { items: result.items.map((item) => ({ id: item.id, scheduledAt: item.scheduledAt || null, status: item.status || null, tournamentName: item.tournament?.name || null })) }, context, blocks, result.pagination, null, blocks.length ? [] : ['BROWSE_TOURNAMENTS']);
  }

  private async getMyRankings(context: AiToolContext): Promise<AiToolResultEnvelope> {
    const result = await this.rankingsService.getUserRankings(context.userId!);
    const items = [...this.list<any>(result?.publicRanks), ...this.list<any>(result?.communityRanks)];
    const blocks = items.slice(0, 10).map((item, index) => ({
      type: 'tournament' as const,
      id: `ranking-${item.id || index}`,
      title: item.category?.name || item.community?.name || 'Xếp hạng cá nhân',
      data: { eloPoints: item.eloPoints ?? null, matchesPlayed: item.matchesPlayed ?? 0, matchesWon: item.matchesWon ?? 0, winStreak: item.winStreak ?? 0, communityName: item.community?.name || null },
      actions: [],
    }));
    return this.envelope(blocks.length ? 'SUCCESS' : 'EMPTY_RESULT', { rankings: items.slice(0, 10).map((item) => this.compactRanking(item)) }, context, blocks, { page: 1, pageSize: 10, total: items.length, hasNextPage: items.length > 10 }, null, blocks.length ? [] : ['PLAY_MATCHES']);
  }

  private async getTournamentRegistrationStatus(args: Record<string, unknown>, context: AiToolContext): Promise<AiToolResultEnvelope> {
    const status: any = await this.tournamentsService.myRegistration(String(args.tournamentId), context.userId!, typeof args.divisionId === 'string' ? args.divisionId : undefined);
    if (!status?.registered || !status?.participant) return this.envelope('EMPTY_RESULT', { registration: null }, context, [{ type: 'empty', id: 'registration-empty', title: 'Chưa có đăng ký', data: { message: 'Bạn chưa có đăng ký trong giải này.' }, actions: [{ label: 'Xem giải', action: 'navigate', href: `/tournaments/${args.tournamentId}`, intent: 'primary' }] }], undefined, null, ['VIEW_TOURNAMENT']);
    const participant = status.participant;
    const tournament = { id: args.tournamentId, name: participant.teamName || 'Đăng ký giải' };
    const block = this.tournamentCard(tournament, 'registration', { registrationStatus: participant.teamStatus || 'REGISTERED', paymentStatus: participant.isPaid ? 'PAID' : 'UNPAID', participantId: participant.id });
    return this.envelope('SUCCESS', { registration: this.compactRegistration(status, participant) }, context, [block]);
  }

  private compactTournament(item: any): Record<string, unknown> {
    return { id: item?.id, name: item?.name || 'Giải đấu', status: item?.status || null, sport: item?.category?.name || item?.sport || null, startDate: item?.startDate || null, endDate: item?.endDate || null, venue: item?.venue?.name || item?.venueName || null };
  }

  private compactCommunity(item: any): Record<string, unknown> {
    return { id: item?.id, name: item?.name || 'CLB', visibility: item?.visibility || null, joinMode: item?.joinMode || null, memberCount: item?._count?.members ?? item?.memberCount ?? null };
  }

  private compactRanking(item: any): Record<string, unknown> {
    return { id: item?.id || null, communityName: item?.community?.name || null, category: item?.category?.name || null, eloPoints: item?.eloPoints ?? null, matchesPlayed: item?.matchesPlayed ?? 0, matchesWon: item?.matchesWon ?? 0, winStreak: item?.winStreak ?? 0 };
  }

  private compactRegistration(status: any, participant: any): Record<string, unknown> {
    return { registered: Boolean(status?.registered), participantId: participant?.id || null, teamName: participant?.teamName || null, teamStatus: participant?.teamStatus || null, isPaid: Boolean(participant?.isPaid), tournamentDivisionId: participant?.tournamentDivisionId || null };
  }

  toToolStartEvent(name: string, round: number): AiToolEvent {
    return { type: 'tool_start', tool: name, label: this.labelFor(name), round };
  }

  toToolResultEvent(name: string, round: number, result: AiToolResultEnvelope): AiToolEvent {
    return { type: 'tool_result', tool: name, label: this.labelFor(name), round, status: result.status, uiBlocks: result.uiBlocks };
  }
}
