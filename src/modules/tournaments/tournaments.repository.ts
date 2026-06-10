import { Injectable, Inject, BadRequestException, NotFoundException } from '@nestjs/common';
import { PG_CONNECTION } from '../../database/database.module';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../../database/schema';
import { eq, ne, ilike, and, count, SQL, inArray, sql } from 'drizzle-orm';
import { AuditService, Transaction } from '../audit/audit.service';
import { CreateTournamentDto } from './dto/create-tournament.dto';
import { UpdateTournamentDto } from './dto/update-tournament.dto';
import { QueryTournamentDto } from './dto/query-tournament.dto';
import { RegisterTournamentDto } from './dto/register-tournament.dto';
import { UpdateStageDto } from './dto/update-stage.dto';
import { RosterMember, BracketMatch, BracketGroup, BracketStage } from './interfaces/tournament-config.interface';

@Injectable()
export class TournamentsRepository {
  constructor(
    @Inject(PG_CONNECTION) private readonly db: NodePgDatabase<typeof schema>,
    private readonly auditService: AuditService,
  ) {}

  async findAll(query: QueryTournamentDto) {
    const { page = 1, limit = 10, search, categoryId, status, tournamentType, matchType, communityId, visibility, region, createdBy } = query;
    const offset = (page - 1) * limit;

    const conditions: SQL[] = [];

    // Always exclude soft-deleted tournaments
    conditions.push(sql`${schema.tournaments.deletedAt} IS NULL`);

    // Exclude DRAFT tournaments from public listing (unless createdBy is specified)
    if (!createdBy) {
      conditions.push(ne(schema.tournaments.status, 'DRAFT'));
    }

    if (search) {
      conditions.push(ilike(schema.tournaments.name, `%${search}%`));
    }
    if (categoryId) {
      conditions.push(eq(schema.tournaments.categoryId, categoryId));
    }
    if (status) {
      conditions.push(eq(schema.tournaments.status, status));
    }
    if (communityId) {
      conditions.push(eq(schema.tournaments.communityId, communityId));
      const type = tournamentType || 'CLUB';
      conditions.push(eq(schema.tournaments.tournamentType, type));
    } else {
      const type = tournamentType || 'PUBLIC';
      conditions.push(eq(schema.tournaments.tournamentType, type));
    }
    if (matchType) {
      conditions.push(eq(schema.tournaments.matchType, matchType));
    }

    if (createdBy) {
      conditions.push(eq(schema.tournaments.createdBy, createdBy));
      if (visibility) {
        conditions.push(eq(schema.tournaments.visibility, visibility));
      }
    } else {
      const reqVisibility = visibility || 'PUBLIC';
      conditions.push(eq(schema.tournaments.visibility, reqVisibility));
    }

    if (region) {
      conditions.push(
        sql`exists (
          select 1 from ${schema.tournamentVenues} v 
          where v.id = ${schema.tournaments.venueId} 
          and v.location_address ilike ${`%${region}%`}
        )`
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalRecord] = await this.db
      .select({ count: count() })
      .from(schema.tournaments)
      .where(whereClause);

    const data = await this.db
      .select()
      .from(schema.tournaments)
      .where(whereClause)
      .limit(limit)
      .offset(offset);

    return {
      data,
      meta: {
        total: totalRecord.count,
        page,
        limit,
        totalPages: Math.ceil(totalRecord.count / limit),
      },
    };
  }

  async generateUniqueInviteCode(tx: Transaction | NodePgDatabase<typeof schema>): Promise<string> {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    let exists = true;
    while (exists) {
      code = '';
      for (let i = 0; i < 8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      const existing = await tx
        .select({ id: schema.tournaments.id })
        .from(schema.tournaments)
        .where(eq(schema.tournaments.inviteCode, code))
        .limit(1);
      if (existing.length === 0) {
        exists = false;
      }
    }
    return code;
  }

  async findById(id: string) {
    const result = await this.db
      .select({
        tournament: schema.tournaments,
        category: {
          id: schema.categories.id,
          name: schema.categories.name,
          slug: schema.categories.slug,
        },
        community: {
          id: schema.communities.id,
          name: schema.communities.name,
          logoUrl: schema.communities.logoUrl,
        },
        venue: {
          id: schema.tournamentVenues.id,
          name: schema.tournamentVenues.name,
          locationAddress: schema.tournamentVenues.locationAddress,
        },
        creator: {
          id: schema.users.id,
          fullName: schema.profiles.fullName,
          avatarUrl: schema.profiles.avatarUrl,
        },
      })
      .from(schema.tournaments)
      .leftJoin(schema.categories, eq(schema.tournaments.categoryId, schema.categories.id))
      .leftJoin(schema.communities, eq(schema.tournaments.communityId, schema.communities.id))
      .leftJoin(schema.tournamentVenues, eq(schema.tournaments.venueId, schema.tournamentVenues.id))
      .leftJoin(schema.users, eq(schema.tournaments.createdBy, schema.users.id))
      .leftJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
      .where(eq(schema.tournaments.id, id))
      .limit(1);

    if (result.length === 0) return null;
    const row = result[0];

    // Count participants
    const [participantCount] = await this.db
      .select({ count: count() })
      .from(schema.tournamentParticipants)
      .where(eq(schema.tournamentParticipants.tournamentId, id));

    // Count matches summary
    let matchesTotal = 0;
    let matchesCompleted = 0;
    let matchesLive = 0;

    try {
      const [totalCount] = await this.db
        .select({ count: count() })
        .from(schema.matches)
        .innerJoin(schema.tournamentGroups, eq(schema.matches.groupId, schema.tournamentGroups.id))
        .innerJoin(schema.tournamentStages, eq(schema.tournamentGroups.stageId, schema.tournamentStages.id))
        .where(eq(schema.tournamentStages.tournamentId, id));
      matchesTotal = totalCount.count;

      const [completedCount] = await this.db
        .select({ count: count() })
        .from(schema.matches)
        .innerJoin(schema.tournamentGroups, eq(schema.matches.groupId, schema.tournamentGroups.id))
        .innerJoin(schema.tournamentStages, eq(schema.tournamentGroups.stageId, schema.tournamentStages.id))
        .where(
          and(
            eq(schema.tournamentStages.tournamentId, id),
            eq(schema.matches.status, 'COMPLETED')
          )
        );
      matchesCompleted = completedCount.count;

      const [liveCount] = await this.db
        .select({ count: count() })
        .from(schema.matches)
        .innerJoin(schema.tournamentGroups, eq(schema.matches.groupId, schema.tournamentGroups.id))
        .innerJoin(schema.tournamentStages, eq(schema.tournamentGroups.stageId, schema.tournamentStages.id))
        .where(
          and(
            eq(schema.tournamentStages.tournamentId, id),
            eq(schema.matches.status, 'ONGOING')
          )
        );
      matchesLive = liveCount.count;
    } catch (e) {
      // ignore table or column errors in case matches tables are empty
    }

    return {
      ...row.tournament,
      category: row.category?.id ? row.category : null,
      community: row.community?.id ? row.community : null,
      venue: row.venue?.id ? row.venue : null,
      creator: row.creator?.id ? row.creator : null,
      _summary: {
        participantCount: participantCount.count,
        matchesTotal,
        matchesCompleted,
        matchesLive,
      },
    };
  }

  async create(userId: string, data: CreateTournamentDto) {
    return await this.db.transaction(async (tx) => {
      const inviteCode = await this.generateUniqueInviteCode(tx);
      const [record] = await tx
        .insert(schema.tournaments)
        .values({
          createdBy: userId,
          name: data.name,
          categoryId: data.categoryId,
          communityId: data.communityId || null,
          description: data.description || null,
          sportRules: data.sportRules as typeof schema.tournaments.$inferInsert['sportRules'],
          tournamentConfig: data.tournamentConfig as typeof schema.tournaments.$inferInsert['tournamentConfig'],
          entryFee: (data.entryFee || 0).toString(),
          platformFeePercentage: (data.platformFeePercentage || 5.0).toString(),
          registrationStartDate: data.registrationStartDate ? new Date(data.registrationStartDate) : null,
          registrationEndDate: data.registrationEndDate ? new Date(data.registrationEndDate) : null,
          maxParticipants: data.maxParticipants || null,
          startDate: data.startDate ? new Date(data.startDate) : null,
          endDate: data.endDate ? new Date(data.endDate) : null,
          venueId: data.venueId || null,
          tournamentType: data.tournamentType || 'CLUB',
          bannerUrl: data.bannerUrl || null,
          logoUrl: data.logoUrl || null,
          galleryImages: data.galleryImages || [],
          prizeDescription: data.prizeDescription || null,
          prizes: data.prizes as typeof schema.tournaments.$inferInsert['prizes'],
          inviteCode: inviteCode,
          contactInfo: data.contactInfo as typeof schema.tournaments.$inferInsert['contactInfo'],
          status: 'DRAFT',
          platformFeePerPlayer: data.platformFeePerPlayer !== undefined ? data.platformFeePerPlayer : 10000,
          visibility: data.visibility || 'PUBLIC',
          genderRestriction: data.genderRestriction || null,
        })
        .returning();
      
      await this.auditService.logCreate(tx, userId, 'tournaments', record.id, record);
      return record;
    });
  }

  async update(id: string, userId: string, data: UpdateTournamentDto) {
    return await this.db.transaction(async (tx) => {
      const [oldRecord] = await tx.select().from(schema.tournaments).where(eq(schema.tournaments.id, id)).limit(1);

      const [updated] = await tx
        .update(schema.tournaments)
        .set({
          ...(data.name && { name: data.name }),
          ...(data.categoryId && { categoryId: data.categoryId }),
          ...(data.communityId !== undefined && { communityId: data.communityId }),
          ...(data.description !== undefined && { description: data.description }),
          ...(data.status && { status: data.status }),
          ...(data.sportRules && { sportRules: data.sportRules as typeof schema.tournaments.$inferInsert['sportRules'] }),
          ...(data.tournamentConfig && {
            tournamentConfig: data.tournamentConfig as typeof schema.tournaments.$inferInsert['tournamentConfig'],
          }),
          ...(data.entryFee !== undefined && {
            entryFee: data.entryFee.toString(),
          }),
          ...(data.platformFeePercentage !== undefined && {
            platformFeePercentage: data.platformFeePercentage.toString(),
          }),
          ...(data.platformFeePerPlayer !== undefined && {
            platformFeePerPlayer: data.platformFeePerPlayer,
          }),
          ...(data.registrationStartDate !== undefined && {
            registrationStartDate: data.registrationStartDate ? new Date(data.registrationStartDate) : null,
          }),
          ...(data.registrationEndDate !== undefined && {
            registrationEndDate: data.registrationEndDate ? new Date(data.registrationEndDate) : null,
          }),
          ...(data.maxParticipants !== undefined && { maxParticipants: data.maxParticipants }),
          ...(data.startDate && { startDate: new Date(data.startDate) }),
          ...(data.endDate && { endDate: new Date(data.endDate) }),
          ...(data.venueId !== undefined && { venueId: data.venueId }),
          ...(data.tournamentType && { tournamentType: data.tournamentType }),
          ...(data.bannerUrl !== undefined && { bannerUrl: data.bannerUrl }),
          ...(data.logoUrl !== undefined && { logoUrl: data.logoUrl }),
          ...(data.galleryImages !== undefined && { galleryImages: data.galleryImages }),
          ...(data.prizeDescription !== undefined && { prizeDescription: data.prizeDescription }),
          ...(data.prizes !== undefined && { prizes: data.prizes as typeof schema.tournaments.$inferInsert['prizes'] }),
          ...(data.contactInfo !== undefined && { contactInfo: data.contactInfo as typeof schema.tournaments.$inferInsert['contactInfo'] }),
          ...(data.visibility !== undefined && { visibility: data.visibility }),
          ...(data.genderRestriction !== undefined && { genderRestriction: data.genderRestriction }),
          updatedAt: new Date(),
        })
        .where(eq(schema.tournaments.id, id))
        .returning();

      await this.auditService.logUpdate(tx, userId, 'tournaments', id, oldRecord, updated);
      return updated;
    });
  }

  async softDelete(id: string, userId: string) {
    return await this.db.transaction(async (tx) => {
      const [oldRecord] = await tx.select().from(schema.tournaments).where(eq(schema.tournaments.id, id)).limit(1);

      const [deleted] = await tx
        .update(schema.tournaments)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(schema.tournaments.id, id))
        .returning();

      await this.auditService.logDelete(tx, userId, 'tournaments', id, oldRecord);
      return deleted;
    });
  }

  async registerParticipant(tournamentId: string, userId: string, data: RegisterTournamentDto, inviteCode?: string) {
    return await this.db.transaction(async (tx) => {
      // 1. Kiểm tra giải đấu
      const [tournament] = await tx
        .select()
        .from(schema.tournaments)
        .where(eq(schema.tournaments.id, tournamentId))
        .limit(1);

      if (!tournament) {
        throw new BadRequestException('Tournament not found');
      }

      // 2. Kiểm tra trạng thái - phải mở đăng ký (REGISTRATION_OPEN hoặc UPCOMING)
      if (tournament.status !== 'REGISTRATION_OPEN' && tournament.status !== 'UPCOMING') {
        throw new BadRequestException('Giải đấu chưa hoặc đã đóng đăng ký.');
      }

      // 3. Kiểm tra thời hạn đăng ký
      const now = new Date();
      if (tournament.registrationStartDate && now < tournament.registrationStartDate) {
        throw new BadRequestException('Thời gian đăng ký chưa bắt đầu.');
      }
      if (tournament.registrationEndDate && now > tournament.registrationEndDate) {
        throw new BadRequestException('Thời gian đăng ký đã kết thúc.');
      }

      // 4. Kiểm tra mã mời nếu giải PRIVATE
      if (tournament.visibility === 'PRIVATE') {
        if (!inviteCode || tournament.inviteCode !== inviteCode) {
          throw new BadRequestException('Mã mời giải đấu không hợp lệ hoặc thiếu.');
        }
      }

      // 5. Kiểm tra giới tính người đăng ký (đối với leader)
      if (tournament.genderRestriction) {
        const [profile] = await tx
          .select({ gender: schema.profiles.gender })
          .from(schema.profiles)
          .where(eq(schema.profiles.userId, userId))
          .limit(1);
        if (!profile || !profile.gender) {
          throw new BadRequestException('Vui lòng cập nhật giới tính trong hồ sơ cá nhân để đăng ký.');
        }
        const userGender = profile.gender.toUpperCase();
        const restriction = tournament.genderRestriction.toUpperCase();
        if (restriction === 'MALE' && userGender !== 'MALE') {
          throw new BadRequestException('Giải đấu chỉ dành cho Nam.');
        }
        if (restriction === 'FEMALE' && userGender !== 'FEMALE') {
          throw new BadRequestException('Giải đấu chỉ dành cho Nữ.');
        }
        // MIXED check will be enforced when partner joins for doubles
      }

      // 6. Kiểm tra số lượng tối đa
      if (tournament.maxParticipants) {
        const [participantCount] = await tx
          .select({ count: count() })
          .from(schema.tournamentParticipants)
          .where(
            and(
              eq(schema.tournamentParticipants.tournamentId, tournamentId),
              ne(schema.tournamentParticipants.teamStatus, 'WITHDRAWN')
            )
          );
        
        if (participantCount.count >= tournament.maxParticipants) {
          throw new BadRequestException('Giải đấu đã đầy.');
        }
      }

      // 7. CLUB check: user must be community member
      if (tournament.tournamentType === 'CLUB' && tournament.communityId) {
        const member = await tx
          .select()
          .from(schema.communityMembers)
          .where(
            and(
              eq(schema.communityMembers.communityId, tournament.communityId),
              eq(schema.communityMembers.userId, userId),
              eq(schema.communityMembers.status, 'JOINED')
            )
          )
          .limit(1);
        if (member.length === 0) {
          throw new BadRequestException('Chỉ thành viên CLB mới được đăng ký giải đấu này.');
        }
      }

      // 8. Kiểm tra xem người đăng ký đã có trong giải đấu này chưa (chống trùng)
      const existingRosters = await tx
        .select({ userId: schema.tournamentRosters.userId })
        .from(schema.tournamentRosters)
        .innerJoin(schema.tournamentParticipants, eq(schema.tournamentRosters.participantId, schema.tournamentParticipants.id))
        .where(
          and(
            eq(schema.tournamentParticipants.tournamentId, tournamentId),
            eq(schema.tournamentRosters.userId, userId),
            ne(schema.tournamentParticipants.teamStatus, 'WITHDRAWN')
          )
        );
      if (existingRosters.length > 0) {
        throw new BadRequestException('Bạn đã đăng ký tham gia giải đấu này rồi.');
      }

      // 9. Thêm participant
      const isDoubles = tournament.matchType === 'DOUBLES' || tournament.matchType === 'MIXED_DOUBLES';
      const teamInviteToken = isDoubles ? Math.random().toString(36).substring(2, 14).toUpperCase() : null;
      const teamStatus = isDoubles ? 'PENDING' : 'COMPLETE';
      const entryFeeAmount = parseFloat(tournament.entryFee || '0');
      const isPaid = entryFeeAmount === 0;

      const [participant] = await tx
        .insert(schema.tournamentParticipants)
        .values({
          tournamentId,
          registeredBy: userId,
          teamName: data.teamName,
          isPaid,
          teamInviteToken,
          teamStatus,
        })
        .returning();

      // 10. Thêm rosters cho Leader
      await tx.insert(schema.tournamentRosters).values({
        participantId: participant.id,
        userId: userId,
        role: 'MAIN',
      });

      // 11. Xử lý Payment cho Singles (nếu có phí)
      let paymentUrl: string | null = null;
      if (!isDoubles && entryFeeAmount > 0) {
        const [payment] = await tx
          .insert(schema.payments)
          .values({
            userId,
            tournamentId,
            participantId: participant.id,
            amount: entryFeeAmount.toString(),
            status: 'PENDING',
            paymentGateway: 'VNPAY',
          })
          .returning();
        
        paymentUrl = `https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?vnp_TxnRef=${payment.id}&vnp_Amount=${entryFeeAmount * 100}`;
      }

      // 12. Audit log
      await this.auditService.logCreate(tx, userId, 'tournament_participants', participant.id, participant);

      return {
        participant,
        paymentUrl,
        teamInviteLink: isDoubles 
          ? `/tournaments/${tournamentId}/join-team?pid=${participant.id}&token=${teamInviteToken}`
          : null
      };
    });
  }

  async joinTeam(tournamentId: string, userId: string, participantId: string, teamInviteToken: string) {
    return await this.db.transaction(async (tx) => {
      // 1. Kiểm tra giải đấu
      const [tournament] = await tx
        .select()
        .from(schema.tournaments)
        .where(eq(schema.tournaments.id, tournamentId))
        .limit(1);
      if (!tournament) throw new NotFoundException('Tournament not found');

      // 2. Tìm participant khớp với token
      const [participant] = await tx
        .select()
        .from(schema.tournamentParticipants)
        .where(
          and(
            eq(schema.tournamentParticipants.id, participantId),
            eq(schema.tournamentParticipants.teamInviteToken, teamInviteToken)
          )
        )
        .limit(1);

      if (!participant) {
        throw new BadRequestException('Mã mời đồng đội hoặc đội thi đấu không hợp lệ.');
      }

      if (participant.teamStatus !== 'PENDING') {
        throw new BadRequestException('Đội thi đấu này đã đủ thành viên hoặc không ở trạng thái chờ.');
      }

      // 3. Kiểm tra user chưa đăng ký giải này
      const existingRosters = await tx
        .select({ userId: schema.tournamentRosters.userId })
        .from(schema.tournamentRosters)
        .innerJoin(schema.tournamentParticipants, eq(schema.tournamentRosters.participantId, schema.tournamentParticipants.id))
        .where(
          and(
            eq(schema.tournamentParticipants.tournamentId, tournamentId),
            eq(schema.tournamentRosters.userId, userId),
            ne(schema.tournamentParticipants.teamStatus, 'WITHDRAWN')
          )
        );
      if (existingRosters.length > 0) {
        throw new BadRequestException('Bạn đã đăng ký tham gia giải đấu này rồi.');
      }

      // 4. Lấy giới tính của Leader và Partner để kiểm tra ràng buộc
      const leaderRoster = await tx
        .select()
        .from(schema.tournamentRosters)
        .where(eq(schema.tournamentRosters.participantId, participantId))
        .limit(1);
      
      if (leaderRoster.length === 0) {
        throw new BadRequestException('Không tìm thấy trưởng nhóm.');
      }
      const leaderId = leaderRoster[0].userId;

      const [leaderProfile] = await tx
        .select({ gender: schema.profiles.gender })
        .from(schema.profiles)
        .where(eq(schema.profiles.userId, leaderId))
        .limit(1);

      const [partnerProfile] = await tx
        .select({ gender: schema.profiles.gender })
        .from(schema.profiles)
        .where(eq(schema.profiles.userId, userId))
        .limit(1);

      if (tournament.genderRestriction) {
        if (!partnerProfile || !partnerProfile.gender) {
          throw new BadRequestException('Vui lòng cập nhật giới tính trong hồ sơ để tham gia.');
        }

        const leaderGender = leaderProfile?.gender?.toUpperCase();
        const partnerGender = partnerProfile.gender.toUpperCase();
        const restriction = tournament.genderRestriction.toUpperCase();

        if (restriction === 'MALE' && partnerGender !== 'MALE') {
          throw new BadRequestException('Giải đấu chỉ dành cho Nam.');
        }
        if (restriction === 'FEMALE' && partnerGender !== 'FEMALE') {
          throw new BadRequestException('Giải đấu chỉ dành cho Nữ.');
        }
        if (restriction === 'MIXED') {
          if (!leaderGender) {
            throw new BadRequestException('Không tìm thấy giới tính của trưởng nhóm để xác nhận Mixed Doubles.');
          }
          if (leaderGender === partnerGender) {
            throw new BadRequestException('Giải đấu Mixed Doubles yêu cầu 1 Nam và 1 Nữ.');
          }
        }
      }

      // 5. Thêm roster cho Partner
      await tx
        .insert(schema.tournamentRosters)
        .values({
          participantId: participant.id,
          userId: userId,
          role: 'MAIN',
        });

      // 6. Cập nhật trạng thái đội hoàn tất
      const entryFeeAmount = parseFloat(tournament.entryFee || '0');
      const isPaid = entryFeeAmount === 0;

      const [updatedParticipant] = await tx
        .update(schema.tournamentParticipants)
        .set({
          teamStatus: 'COMPLETE',
          isPaid,
        })
        .where(eq(schema.tournamentParticipants.id, participantId))
        .returning();

      // 7. Tạo Payment cho Doubles khi đội hoàn tất (nếu có phí)
      let paymentUrl: string | null = null;
      if (entryFeeAmount > 0) {
        const [payment] = await tx
          .insert(schema.payments)
          .values({
            userId: participant.registeredBy, // Người đăng ký (Leader) thanh toán
            tournamentId,
            participantId: participant.id,
            amount: entryFeeAmount.toString(),
            status: 'PENDING',
            paymentGateway: 'VNPAY',
          })
          .returning();
        
        paymentUrl = `https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?vnp_TxnRef=${payment.id}&vnp_Amount=${entryFeeAmount * 100}`;
      }

      await this.auditService.logUpdate(tx, userId, 'tournament_participants', participantId, participant, updatedParticipant);

      return {
        participant: updatedParticipant,
        paymentUrl,
      };
    });
  }

  async withdraw(tournamentId: string, userId: string) {
    return await this.db.transaction(async (tx) => {
      // 1. Tìm participant mà user đang tham gia
      const userRoster = await tx
        .select({ participantId: schema.tournamentRosters.participantId })
        .from(schema.tournamentRosters)
        .innerJoin(schema.tournamentParticipants, eq(schema.tournamentRosters.participantId, schema.tournamentParticipants.id))
        .where(
          and(
            eq(schema.tournamentParticipants.tournamentId, tournamentId),
            eq(schema.tournamentRosters.userId, userId),
            ne(schema.tournamentParticipants.teamStatus, 'WITHDRAWN')
          )
        )
        .limit(1);

      if (userRoster.length === 0) {
        throw new BadRequestException('Bạn chưa đăng ký giải đấu này hoặc đã rút lui.');
      }

      const participantId = userRoster[0].participantId;

      // 2. Kiểm tra giải đấu chưa bắt đầu
      const [tournament] = await tx
        .select()
        .from(schema.tournaments)
        .where(eq(schema.tournaments.id, tournamentId))
        .limit(1);

      if (!tournament) throw new NotFoundException('Tournament not found');

      if (tournament.status === 'IN_PROGRESS' || tournament.status === 'COMPLETED') {
        throw new BadRequestException('Giải đấu đã bắt đầu hoặc kết thúc, không thể rút lui.');
      }

      // 3. Cập nhật trạng thái
      const [oldParticipant] = await tx
        .select()
        .from(schema.tournamentParticipants)
        .where(eq(schema.tournamentParticipants.id, participantId))
        .limit(1);

      const [updatedParticipant] = await tx
        .update(schema.tournamentParticipants)
        .set({ teamStatus: 'WITHDRAWN', teamInviteToken: null }) // clear invite code or invite tokens if any
        .where(eq(schema.tournamentParticipants.id, participantId))
        .returning();

      // 4. Nếu đã thanh toán, thực hiện hoàn tiền (mock refund log)
      let refundAmount: string | null = null;
      if (oldParticipant.isPaid) {
        const entryFeeAmount = parseFloat(tournament.entryFee || '0');
        if (entryFeeAmount > 0) {
          // Tạo một transaction refund trong bảng payments với trạng thái COMPLETED
          await tx
            .insert(schema.payments)
            .values({
              userId: oldParticipant.registeredBy,
              tournamentId,
              participantId,
              amount: `-${entryFeeAmount}`,
              status: 'COMPLETED',
              paymentGateway: 'REFUND',
            });
          refundAmount = entryFeeAmount.toString();
        }
      }

      await this.auditService.logUpdate(tx, userId, 'tournament_participants', participantId, oldParticipant, updatedParticipant);

      return {
        message: 'Đã rút khỏi giải đấu thành công.',
        refundAmount,
      };
    });
  }

  async myRegistration(tournamentId: string, userId: string) {
    const userRoster = await this.db
      .select({ participantId: schema.tournamentRosters.participantId })
      .from(schema.tournamentRosters)
      .innerJoin(schema.tournamentParticipants, eq(schema.tournamentRosters.participantId, schema.tournamentParticipants.id))
      .where(
        and(
          eq(schema.tournamentParticipants.tournamentId, tournamentId),
          eq(schema.tournamentRosters.userId, userId),
          ne(schema.tournamentParticipants.teamStatus, 'WITHDRAWN')
        )
      )
      .limit(1);

    if (userRoster.length === 0) {
      return { registered: false };
    }

    const participantId = userRoster[0].participantId;

    const [participant] = await this.db
      .select()
      .from(schema.tournamentParticipants)
      .where(eq(schema.tournamentParticipants.id, participantId))
      .limit(1);

    const members = await this.db
      .select({
        userId: schema.tournamentRosters.userId,
        role: schema.tournamentRosters.role,
        fullName: schema.profiles.fullName,
        avatarUrl: schema.profiles.avatarUrl,
      })
      .from(schema.tournamentRosters)
      .innerJoin(schema.users, eq(schema.tournamentRosters.userId, schema.users.id))
      .innerJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
      .where(eq(schema.tournamentRosters.participantId, participantId));

    return {
      registered: true,
      participant: {
        id: participant.id,
        teamName: participant.teamName,
        teamStatus: participant.teamStatus,
        isPaid: participant.isPaid,
        teamInviteToken: participant.teamInviteToken,
        teamMembers: members,
        teamInviteLink: participant.teamStatus === 'PENDING' && participant.registeredBy === userId
          ? `/tournaments/${tournamentId}/join-team?pid=${participant.id}&token=${participant.teamInviteToken}`
          : null
      }
    };
  }

  async findCommunityMember(communityId: string, userId: string) {
    const records = await this.db
      .select()
      .from(schema.communityMembers)
      .where(
        and(
          eq(schema.communityMembers.communityId, communityId),
          eq(schema.communityMembers.userId, userId),
        ),
      )
      .limit(1);
    return records[0];
  }

  async findParticipants(
    tournamentId: string,
    categoryId: string,
  ): Promise<
    {
      id: string;
      teamName: string;
      seed: number | null;
      isPaid: boolean;
      registeredAt: Date;
      registeredBy: {
        id: string | null;
        fullName: string | null;
        avatarUrl: string | null;
      } | null;
      members: RosterMember[];
    }[]
  > {
    // 1. Fetch participants and their registeredBy info
    const participants = await this.db
      .select({
        id: schema.tournamentParticipants.id,
        teamName: schema.tournamentParticipants.teamName,
        seed: schema.tournamentParticipants.seed,
        isPaid: schema.tournamentParticipants.isPaid,
        registeredAt: schema.tournamentParticipants.registeredAt,
        registeredBy: {
          id: schema.users.id,
          fullName: schema.profiles.fullName,
          avatarUrl: schema.profiles.avatarUrl,
        },
      })
      .from(schema.tournamentParticipants)
      .leftJoin(schema.users, eq(schema.tournamentParticipants.registeredBy, schema.users.id))
      .leftJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
      .where(eq(schema.tournamentParticipants.tournamentId, tournamentId));

    if (participants.length === 0) return [];

    // 2. Fetch rosters and ELO info for all participant IDs
    const participantIds = participants.map((p) => p.id);

    const rosters = await this.db
      .select({
        participantId: schema.tournamentRosters.participantId,
        userId: schema.tournamentRosters.userId,
        role: schema.tournamentRosters.role,
        fullName: schema.profiles.fullName,
        avatarUrl: schema.profiles.avatarUrl,
        eloPoints: schema.userRanks.eloPoints,
        tierName: schema.eloTiers.name,
      })
      .from(schema.tournamentRosters)
      .leftJoin(schema.users, eq(schema.tournamentRosters.userId, schema.users.id))
      .leftJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
      .leftJoin(
        schema.userRanks,
        and(
          eq(schema.tournamentRosters.userId, schema.userRanks.userId),
          eq(schema.userRanks.categoryId, categoryId)
        )
      )
      .leftJoin(schema.eloTiers, eq(schema.userRanks.tierId, schema.eloTiers.id))
      .where(inArray(schema.tournamentRosters.participantId, participantIds));

    // Group rosters by participantId
    const rostersMap = new Map<string, RosterMember[]>();
    for (const r of rosters) {
      const list = rostersMap.get(r.participantId) || [];
      list.push({
        userId: r.userId,
        fullName: r.fullName,
        avatarUrl: r.avatarUrl,
        role: r.role,
        elo: {
          eloPoints: r.eloPoints ?? 1200,
          tierName: r.tierName ?? 'Beginner',
        },
      });
      rostersMap.set(r.participantId, list);
    }

    return participants.map((p) => ({
      ...p,
      members: rostersMap.get(p.id) || [],
    }));
  }

  async findBracket(tournamentId: string): Promise<{ stages: BracketStage[] }> {
    const stages = await this.db
      .select()
      .from(schema.tournamentStages)
      .where(eq(schema.tournamentStages.tournamentId, tournamentId))
      .orderBy(schema.tournamentStages.order);

    if (stages.length === 0) return { stages: [] };

    const stageIds = stages.map((s) => s.id);

    const groups = await this.db
      .select()
      .from(schema.tournamentGroups)
      .where(inArray(schema.tournamentGroups.stageId, stageIds));

    const groupIds = groups.map((g) => g.id);

    let matchesList: BracketMatch[] = [];
    if (groupIds.length > 0) {
      const dbMatches = await this.db
        .select()
        .from(schema.matches)
        .where(inArray(schema.matches.groupId, groupIds))
        .orderBy(schema.matches.roundNumber, schema.matches.matchOrder);
      
      const participants = await this.db
        .select({
          id: schema.tournamentParticipants.id,
          teamName: schema.tournamentParticipants.teamName,
          seed: schema.tournamentParticipants.seed,
        })
        .from(schema.tournamentParticipants)
        .where(eq(schema.tournamentParticipants.tournamentId, tournamentId));

      const participantMap = new Map(participants.map((p) => [p.id, p]));

      matchesList = dbMatches.map((m) => ({
        ...m,
        participant1: m.participant1Id ? participantMap.get(m.participant1Id) : null,
        participant2: m.participant2Id ? participantMap.get(m.participant2Id) : null,
      }));
    }

    const groupsMap = new Map<string, BracketGroup[]>();
    for (const g of groups) {
      const groupMatches = matchesList.filter((m) => m.groupId === g.id);
      const list = groupsMap.get(g.stageId) || [];
      list.push({
        id: g.id,
        name: g.name,
        matches: groupMatches,
      });
      groupsMap.set(g.stageId, list);
    }

    return {
      stages: stages.map((s) => ({
        id: s.id,
        name: s.name,
        type: s.type,
        order: s.order,
        groups: groupsMap.get(s.id) || [],
      })),
    };
  }

  async findByInviteCode(inviteCode: string) {
    const result = await this.db
      .select()
      .from(schema.tournaments)
      .where(eq(schema.tournaments.inviteCode, inviteCode))
      .limit(1);

    if (result.length === 0) return null;
    return result[0];
  }

  async findMyTournaments(userId: string) {
    // 1. Tournaments created by user
    const created = await this.db
      .select({ id: schema.tournaments.id })
      .from(schema.tournaments)
      .where(
        and(
          eq(schema.tournaments.createdBy, userId),
          sql`${schema.tournaments.deletedAt} IS NULL`
        )
      );

    // 2. Tournaments joined by user
    const joined = await this.db
      .select({ id: schema.tournaments.id })
      .from(schema.tournaments)
      .innerJoin(schema.tournamentParticipants, eq(schema.tournaments.id, schema.tournamentParticipants.tournamentId))
      .innerJoin(schema.tournamentRosters, eq(schema.tournamentParticipants.id, schema.tournamentRosters.participantId))
      .where(
        and(
          eq(schema.tournamentRosters.userId, userId),
          sql`${schema.tournaments.deletedAt} IS NULL`
        )
      );

    const ids = Array.from(new Set([...created.map(t => t.id), ...joined.map(t => t.id)]));
    if (ids.length === 0) return [];

    return await this.db
      .select()
      .from(schema.tournaments)
      .where(
        and(
          inArray(schema.tournaments.id, ids),
          sql`${schema.tournaments.deletedAt} IS NULL`
        )
      );
  }

  async findCategory(id: string) {
    const result = await this.db
      .select()
      .from(schema.categories)
      .where(eq(schema.categories.id, id))
      .limit(1);
    if (result.length === 0) return null;
    return result[0];
  }

  async regenerateInviteCode(id: string, userId: string) {
    return await this.db.transaction(async (tx) => {
      const newCode = await this.generateUniqueInviteCode(tx);
      const [oldRecord] = await tx.select().from(schema.tournaments).where(eq(schema.tournaments.id, id)).limit(1);

      const [updated] = await tx
        .update(schema.tournaments)
        .set({ inviteCode: newCode, updatedAt: new Date() })
        .where(eq(schema.tournaments.id, id))
        .returning();

      await this.auditService.logUpdate(tx, userId, 'tournaments', id, oldRecord, updated);
      return updated;
    });
  }

  async findStageById(id: string) {
    const result = await this.db
      .select()
      .from(schema.tournamentStages)
      .where(eq(schema.tournamentStages.id, id))
      .limit(1);
    return result[0] || null;
  }

  async updateStage(id: string, userId: string, data: UpdateStageDto) {
    return await this.db.transaction(async (tx) => {
      const [oldRecord] = await tx
        .select()
        .from(schema.tournamentStages)
        .where(eq(schema.tournamentStages.id, id))
        .limit(1);

      if (!oldRecord) return null;

      const [updated] = await tx
        .update(schema.tournamentStages)
        .set({
          ...(data.name && { name: data.name }),
          ...(data.type && { type: data.type }),
          ...(data.order !== undefined && { order: data.order }),
          ...(data.roundConfig !== undefined && { roundConfig: data.roundConfig }),
          ...(data.venueId !== undefined && { venueId: data.venueId || null }),
          ...(data.scheduledDate !== undefined && {
            scheduledDate: data.scheduledDate || null,
          }),
          ...(data.notificationNote !== undefined && {
            notificationNote: data.notificationNote || null,
          }),
        })
        .where(eq(schema.tournamentStages.id, id))
        .returning();

      await this.auditService.logUpdate(tx, userId, 'tournament_stages', id, oldRecord, updated);
      return updated;
    });
  }
}
