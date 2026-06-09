import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { CommunitiesRepository } from './communities.repository';
import { CreateCommunityDto } from './dto/create-community.dto';
import { UpdateCommunityDto } from './dto/update-community.dto';
import { QueryCommunityDto } from './dto/query-community.dto';
import { ReviewCommunityDto } from './dto/review-community.dto';
import { AddMemberDto } from './dto/add-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { UserRole } from '../../common/constants/enums';

@Injectable()
export class CommunitiesService {
  constructor(private readonly communitiesRepository: CommunitiesRepository) {}

  // --- COMMUNITIES ---

  async findAll(query: QueryCommunityDto) {
    return await this.communitiesRepository.findAll(query);
  }

  async findMyCommunities(userId: string) {
    return await this.communitiesRepository.findMyCommunities(userId);
  }

  async findById(id: string) {
    const community = await this.communitiesRepository.findById(id);
    if (!community) {
      throw new NotFoundException('Community not found');
    }
    return community;
  }

  async create(userId: string, dto: CreateCommunityDto) {
    const { lat, lng, categoryIds, ...rest } = dto;
    const data = {
      ...rest,
      creatorId: userId,
      status: 'PENDING',
    };
    return await this.communitiesRepository.create(data, lat, lng, categoryIds);
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateCommunityDto,
    roles: string[],
  ) {
    const community = await this.findById(id);
    await this.checkPermissions(community.id, userId, roles, [
      'OWNER',
      'MODERATOR',
    ]);

    const { lat, lng, categoryIds, ...rest } = dto;
    return await this.communitiesRepository.update(
      id,
      rest,
      lat,
      lng,
      categoryIds,
    );
  }

  async review(adminId: string, id: string, dto: ReviewCommunityDto) {
    await this.findById(id);
    const updateData = {
      status: dto.status,
      approvedBy: adminId,
      reviewedAt: new Date(),
      rejectedReason: dto.rejectedReason || null,
    };
    return await this.communitiesRepository.update(id, updateData);
  }

  async remove(userId: string, id: string, roles: string[]) {
    const community = await this.findById(id);
    // ADMIN can delete anything. Otherwise, must be OWNER.
    if (!roles.includes(UserRole.ADMIN)) {
      await this.checkPermissions(community.id, userId, roles, ['OWNER']);
    }

    return await this.communitiesRepository.delete(id);
  }

  // --- MEMBERS ---

  async getMembers(id: string) {
    await this.findById(id);
    return await this.communitiesRepository.getMembers(id);
  }

  async addMember(
    requesterId: string,
    communityId: string,
    dto: AddMemberDto,
    roles: string[],
  ) {
    await this.checkPermissions(communityId, requesterId, roles, [
      'OWNER',
      'MODERATOR',
    ]);

    // Check if target user is already a member
    const existing = await this.communitiesRepository.findMember(
      communityId,
      dto.userId,
    );
    if (existing) {
      throw new ConflictException('User is already a member of this community');
    }

    return await this.communitiesRepository.addMember(
      communityId,
      dto.userId,
      dto.role,
    );
  }

  async updateMemberRole(
    requesterId: string,
    communityId: string,
    targetUserId: string,
    dto: UpdateMemberDto,
    roles: string[],
  ) {
    await this.checkPermissions(communityId, requesterId, roles, ['OWNER']); // Only OWNER can change roles

    const existing = await this.communitiesRepository.findMember(
      communityId,
      targetUserId,
    );
    if (!existing) {
      throw new NotFoundException('Target user is not a member');
    }

    // Prevent demoting self (optional, but good practice to ensure at least 1 owner remains)
    if (requesterId === targetUserId && dto.role !== 'OWNER') {
      throw new ForbiddenException('Cannot demote yourself from OWNER role');
    }

    return await this.communitiesRepository.updateMemberRole(
      communityId,
      targetUserId,
      dto.role,
    );
  }

  async removeMember(
    requesterId: string,
    communityId: string,
    targetUserId: string,
    roles: string[],
  ) {
    // If user is removing themselves, allow it (leave community).
    // Otherwise, must be OWNER or MODERATOR.
    if (requesterId !== targetUserId) {
      await this.checkPermissions(communityId, requesterId, roles, [
        'OWNER',
        'MODERATOR',
      ]);
    }

    const existing = await this.communitiesRepository.findMember(
      communityId,
      targetUserId,
    );
    if (!existing) {
      throw new NotFoundException('User is not a member');
    }

    if (existing.role === 'OWNER' && requesterId !== targetUserId) {
      throw new ForbiddenException('Cannot remove an OWNER');
    }

    return await this.communitiesRepository.removeMember(
      communityId,
      targetUserId,
    );
  }

  // --- JOIN & FOLLOW ---

  async joinCommunity(userId: string, id: string, answers?: Record<string, string>) {
    const community = await this.findById(id);
    const existing = await this.communitiesRepository.findMember(id, userId);
    
    if (existing) {
      if (existing.status === 'BANNED') throw new ForbiddenException('You are banned from this community');
      throw new ConflictException('You are already a member or have a pending request');
    }

    if (community.joinMode === 'INVITE_ONLY') {
      throw new ForbiddenException('This community is invite-only');
    }

    const status = community.joinMode === 'OPEN' ? 'JOINED' : 'PENDING';
    return await this.communitiesRepository.addMember(id, userId, 'MEMBER', status, answers);
  }

  async reviewJoinRequest(
    userId: string,
    id: string,
    memberId: string,
    action: 'APPROVE' | 'REJECT',
    roles: string[]
  ) {
    await this.checkPermissions(id, userId, roles, ['OWNER', 'MODERATOR']);
    
    const member = await this.communitiesRepository.findMember(id, memberId);
    if (!member || member.status !== 'PENDING') {
      throw new NotFoundException('Pending request not found');
    }

    const newStatus = action === 'APPROVE' ? 'JOINED' : 'REJECTED';
    return await this.communitiesRepository.updateMemberStatus(id, memberId, newStatus, userId);
  }

  async followCommunity(userId: string, id: string) {
    await this.findById(id); // ensure exists
    try {
      return await this.communitiesRepository.addFollow(id, userId, 'FOLLOW');
    } catch {
      throw new ConflictException('Already following');
    }
  }

  async unfollowCommunity(userId: string, id: string) {
    return await this.communitiesRepository.removeFollow(id, userId, 'FOLLOW');
  }

  async favoriteCommunity(userId: string, id: string) {
    await this.findById(id);
    try {
      return await this.communitiesRepository.addFollow(id, userId, 'FAVORITE');
    } catch {
      throw new ConflictException('Already favorited');
    }
  }

  async unfavoriteCommunity(userId: string, id: string) {
    return await this.communitiesRepository.removeFollow(id, userId, 'FAVORITE');
  }

  async getFavorites(userId: string) {
    return await this.communitiesRepository.getFavorites(userId);
  }

  async getJoinRequests(userId: string, id: string, roles: string[]) {
    await this.checkPermissions(id, userId, roles, ['OWNER', 'MODERATOR']);
    return await this.communitiesRepository.getMembers(id, 'PENDING');
  }

  async inviteMember(userId: string, id: string, targetUserId: string, role: string, roles: string[]) {
    await this.checkPermissions(id, userId, roles, ['OWNER', 'MODERATOR']);
    const existing = await this.communitiesRepository.findMember(id, targetUserId);
    if (existing) throw new ConflictException('User is already a member or pending');

    return await this.communitiesRepository.addMember(id, targetUserId, role, 'INVITED', undefined, userId);
  }

  async respondToInvite(userId: string, id: string, action: 'ACCEPT' | 'DECLINE') {
    const member = await this.communitiesRepository.findMember(id, userId);
    if (!member || member.status !== 'INVITED') {
      throw new NotFoundException('No pending invitation found');
    }

    if (action === 'ACCEPT') {
      return await this.communitiesRepository.updateMemberStatus(id, userId, 'JOINED');
    } else {
      return await this.communitiesRepository.removeMember(id, userId);
    }
  }

  // --- GALLERY ---
  async getGallery(id: string) {
    return await this.communitiesRepository.getGallery(id);
  }

  async addGalleryItem(userId: string, id: string, imageUrl: string, caption?: string, roles: string[] = []) {
    await this.checkPermissions(id, userId, roles, ['OWNER', 'MODERATOR']);
    return await this.communitiesRepository.addGalleryItem(id, userId, imageUrl, caption);
  }

  async removeGalleryItem(userId: string, id: string, imageId: string, roles: string[]) {
    await this.checkPermissions(id, userId, roles, ['OWNER', 'MODERATOR']);
    return await this.communitiesRepository.removeGalleryItem(id, imageId);
  }

  // --- TOURNAMENTS ---
  async getTournaments(id: string, status?: string) {
    return await this.communitiesRepository.getTournaments(id, status);
  }

  // --- RANKINGS ---
  async getRankings(id: string, limit?: number) {
    return await this.communitiesRepository.getRankings(id, limit);
  }

  // --- HELPER ---

  private async checkPermissions(
    communityId: string,
    userId: string,
    systemRoles: string[],
    allowedCommunityRoles: string[],
  ) {
    // ADMIN has bypass
    if (systemRoles.includes(UserRole.ADMIN)) return;

    const member = await this.communitiesRepository.findMember(
      communityId,
      userId,
    );
    if (!member) {
      throw new ForbiddenException('You are not a member of this community');
    }

    if (!allowedCommunityRoles.includes(member.role)) {
      throw new ForbiddenException(
        `Requires one of the following community roles: ${allowedCommunityRoles.join(', ')}`,
      );
    }
  }
}
