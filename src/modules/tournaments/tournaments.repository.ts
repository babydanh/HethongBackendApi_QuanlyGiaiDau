import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { PG_CONNECTION } from '../../database/database.module';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../../database/schema';
import { eq, ilike, and, count, SQL } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';
import { CreateTournamentDto } from './dto/create-tournament.dto';
import { UpdateTournamentDto } from './dto/update-tournament.dto';
import { QueryTournamentDto } from './dto/query-tournament.dto';
import { RegisterTournamentDto } from './dto/register-tournament.dto';

@Injectable()
export class TournamentsRepository {
  constructor(
    @Inject(PG_CONNECTION) private readonly db: NodePgDatabase<typeof schema>,
    private readonly auditService: AuditService,
  ) {}

  async findAll(query: QueryTournamentDto) {
    const { page = 1, limit = 10, search, categoryId, status } = query;
    const offset = (page - 1) * limit;

    const conditions: SQL[] = [];
    if (search) {
      conditions.push(ilike(schema.tournaments.name, `%${search}%`));
    }
    if (categoryId) {
      conditions.push(eq(schema.tournaments.categoryId, categoryId));
    }
    if (status) {
      conditions.push(eq(schema.tournaments.status, status));
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

  async findById(id: string) {
    const result = await this.db
      .select()
      .from(schema.tournaments)
      .where(eq(schema.tournaments.id, id))
      .limit(1);

    if (result.length === 0) return null;
    return result[0];
  }

  async create(userId: string, data: CreateTournamentDto) {
    return await this.db.transaction(async (tx) => {
      const [record] = await tx
        .insert(schema.tournaments)
        .values({
          createdBy: userId,
          name: data.name,
          categoryId: data.categoryId,
          communityId: data.communityId,
          description: data.description,
          sportRules: data.sportRules as typeof schema.tournaments.$inferInsert['sportRules'],
          tournamentConfig: data.tournamentConfig as typeof schema.tournaments.$inferInsert['tournamentConfig'],
          entryFee: (data.entryFee || 0).toString(),
          platformFeePercentage: (data.platformFeePercentage || 5.0).toString(),
          startDate: data.startDate ? new Date(data.startDate) : null,
          endDate: data.endDate ? new Date(data.endDate) : null,
          venueId: data.venueId,
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
          ...(data.communityId && { communityId: data.communityId }),
          ...(data.description && { description: data.description }),
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
          ...(data.startDate && { startDate: new Date(data.startDate) }),
          ...(data.endDate && { endDate: new Date(data.endDate) }),
          ...(data.venueId && { venueId: data.venueId }),
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

  async registerParticipant(tournamentId: string, userId: string, data: RegisterTournamentDto) {
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

      // 2. Kiểm tra trạng thái
      if (tournament.status !== 'UPCOMING' && tournament.status !== 'REGISTRATION_OPEN') {
        throw new BadRequestException('Tournament is not open for registration');
      }

      // 3. Kiểm tra thời hạn đăng ký
      const now = new Date();
      if (tournament.registrationStartDate && now < tournament.registrationStartDate) {
        throw new BadRequestException('Registration has not started yet');
      }
      if (tournament.registrationEndDate && now > tournament.registrationEndDate) {
        throw new BadRequestException('Registration has ended');
      }

      // 4. Kiểm tra số lượng
      if (tournament.maxParticipants) {
        const [participantCount] = await tx
          .select({ count: count() })
          .from(schema.tournamentParticipants)
          .where(eq(schema.tournamentParticipants.tournamentId, tournamentId));
        
        if (participantCount.count >= tournament.maxParticipants) {
          throw new BadRequestException('Tournament is full');
        }
      }

      // 5. Thêm participant
      const [participant] = await tx
        .insert(schema.tournamentParticipants)
        .values({
          tournamentId,
          registeredBy: userId,
          teamName: data.teamName,
          isPaid: false, // Mặc định chưa thanh toán
        })
        .returning();

      // 6. Thêm rosters
      const rostersData = data.memberIds.map(memberId => ({
        participantId: participant.id,
        userId: memberId,
        role: 'MAIN',
      }));

      await tx.insert(schema.tournamentRosters).values(rostersData);

      // 7. Audit log
      await this.auditService.logCreate(tx, userId, 'tournament_participants', participant.id, participant);

      return participant;
    });
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
}
