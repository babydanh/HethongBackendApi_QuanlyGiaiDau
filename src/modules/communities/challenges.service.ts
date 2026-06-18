import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { ChallengesRepository } from './challenges.repository';
import { TournamentsService } from '../tournaments/tournaments.service';

@Injectable()
export class ChallengesService {
  constructor(
    private readonly challengesRepository: ChallengesRepository,
    private readonly tournamentsService: TournamentsService,
  ) {}

  async createChallenge(
    senderUserId: string,
    challengerId: string,
    body: { challengedId: string; message?: string; scheduledAt?: string },
  ) {
    const { challengedId, message, scheduledAt } = body;

    if (challengerId === challengedId) {
      throw new BadRequestException('Cannot challenge your own club');
    }

    // Check sender is owner/moderator of challenger
    const member = await this.challengesRepository.findMember(
      challengerId,
      senderUserId,
    );
    if (!member || (member.role !== 'OWNER' && member.role !== 'MODERATOR')) {
      throw new ForbiddenException(
        'Only club owners or moderators can send challenges',
      );
    }

    // Check challenged community exists
    const challenged = await this.challengesRepository.getCommunityNameAndLogo(
      challengedId,
    );
    if (!challenged) {
      throw new NotFoundException('Challenged club not found');
    }

    const challenge = await this.challengesRepository.create({
      challengerId,
      challengedId,
      senderUserId,
      message,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
    });

    return challenge;
  }

  async getChallenges(userId: string, communityId: string) {
    // Check if user is member of community
    const member = await this.challengesRepository.findMember(
      communityId,
      userId,
    );
    if (!member) {
      throw new ForbiddenException('You must be a member to view challenges');
    }

    const list = await this.challengesRepository.findByCommunity(communityId);

    // Populate community names and logos
    const enrichedList = await Promise.all(
      list.map(async (item) => {
        const challenger = await this.challengesRepository.getCommunityNameAndLogo(
          item.challengerId,
        );
        const challenged = await this.challengesRepository.getCommunityNameAndLogo(
          item.challengedId,
        );
        return {
          ...item,
          challengerName: challenger?.name || '',
          challengerLogoUrl: challenger?.logoUrl || '',
          challengedName: challenged?.name || '',
          challengedLogoUrl: challenged?.logoUrl || '',
        };
      }),
    );

    return enrichedList;
  }

  async updateChallengeStatus(
    userId: string,
    communityId: string,
    challengeId: string,
    body: { status: 'ACCEPTED' | 'REJECTED' },
  ) {
    const { status } = body;

    const challenge = await this.challengesRepository.findById(challengeId);
    if (!challenge) {
      throw new NotFoundException('Challenge not found');
    }

    // Only the challenged community manager can accept/reject
    if (challenge.challengedId !== communityId) {
      throw new ForbiddenException(
        'Only the challenged club can respond to this challenge',
      );
    }

    const member = await this.challengesRepository.findMember(
      communityId,
      userId,
    );
    if (!member || (member.role !== 'OWNER' && member.role !== 'MODERATOR')) {
      throw new ForbiddenException(
        'Only club owners or moderators can respond to challenges',
      );
    }

    if (challenge.status !== 'PENDING') {
      throw new BadRequestException('This challenge has already been processed');
    }

    if (status === 'REJECTED') {
      return this.challengesRepository.updateStatus(challengeId, 'REJECTED');
    }

    // Resolve category
    const challengerSports = await this.challengesRepository.getCommunitySports(
      challenge.challengerId,
    );
    const challengedSports = await this.challengesRepository.getCommunitySports(
      challenge.challengedId,
    );

    const sharedCategory = challengerSports.find((cs) =>
      challengedSports.some((ds) => ds.categoryId === cs.categoryId),
    );

    let categoryId = sharedCategory?.categoryId;
    if (!categoryId && challengerSports.length > 0) {
      categoryId = challengerSports[0].categoryId;
    }
    if (!categoryId && challengedSports.length > 0) {
      categoryId = challengedSports[0].categoryId;
    }

    if (!categoryId) {
      throw new BadRequestException(
        'Both clubs must have at least one sport category set to accept a challenge',
      );
    }

    const challenger = await this.challengesRepository.getCommunityNameAndLogo(
      challenge.challengerId,
    );
    const challenged = await this.challengesRepository.getCommunityNameAndLogo(
      challenge.challengedId,
    );

    // Create tournament
    const tournamentName = `Giao hữu: ${challenger?.name || 'CLB A'} vs ${challenged?.name || 'CLB B'}`;

    const tournament = await this.tournamentsService.create(
      userId,
      {
        name: tournamentName,
        categoryId,
        communityId,
        tournamentType: 'CLUB',
        matchType: 'DOUBLES',
        maxParticipants: 16,
        entryFee: 0,
        sportRules: { setsToWin: 2 },
        tournamentConfig: { bracketType: 'SINGLE_ELIMINATION', maxTeams: 16 },
      },
      ['ORGANIZER'], // Grant organizer system role temporarily to bypass checks
    );

    // Update status and link tournament
    return this.challengesRepository.updateStatus(
      challengeId,
      'ACCEPTED',
      tournament.id,
    );
  }
}
