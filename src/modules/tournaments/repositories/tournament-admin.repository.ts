import { Inject, Injectable } from '@nestjs/common';
import { PG_CONNECTION } from '../../../database/database.module';
import type { AppDb } from '../../../database/db.types';
import * as schema from '../../../database/schema';
import { and, eq, SQL } from 'drizzle-orm';

@Injectable()
export class TournamentAdminRepository {
  constructor(@Inject(PG_CONNECTION) private readonly db: AppDb) {}
  async findReferees(tournamentId: string) {
    return this.db
      .select({
        id: schema.tournamentReferees.id,
        userId: schema.tournamentReferees.userId,
        status: schema.tournamentReferees.status,
        fullName: schema.profiles.fullName,
        email: schema.users.email,
        avatarUrl: schema.profiles.avatarUrl,
      })
      .from(schema.tournamentReferees)
      .innerJoin(
        schema.users,
        eq(schema.tournamentReferees.userId, schema.users.id),
      )
      .innerJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
      .where(eq(schema.tournamentReferees.tournamentId, tournamentId));
  }
  async addStaffMember(
    tournamentId: string,
    userId: string,
    role: string,
    createdBy: string,
  ) {
    const [existing] = await this.db
      .select()
      .from(schema.tournamentStaff)
      .where(
        and(
          eq(schema.tournamentStaff.tournamentId, tournamentId),
          eq(schema.tournamentStaff.userId, userId),
        ),
      )
      .limit(1);
    if (existing) {
      const [updated] = await this.db
        .update(schema.tournamentStaff)
        .set({ role })
        .where(
          and(
            eq(schema.tournamentStaff.tournamentId, tournamentId),
            eq(schema.tournamentStaff.userId, userId),
          ),
        )
        .returning();
      return updated ?? existing;
    }
    const [record] = await this.db
      .insert(schema.tournamentStaff)
      .values({ tournamentId, userId, role, createdBy })
      .returning();
    return record;
  }
  async removeStaffMember(tournamentId: string, userId: string) {
    const [record] = await this.db
      .delete(schema.tournamentStaff)
      .where(
        and(
          eq(schema.tournamentStaff.tournamentId, tournamentId),
          eq(schema.tournamentStaff.userId, userId),
        ),
      )
      .returning();
    return record;
  }
  async isCoOrganizer(tournamentId: string, userId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: schema.tournamentStaff.id })
      .from(schema.tournamentStaff)
      .where(
        and(
          eq(schema.tournamentStaff.tournamentId, tournamentId),
          eq(schema.tournamentStaff.userId, userId),
          eq(schema.tournamentStaff.role, 'CO_ORGANIZER'),
        ),
      )
      .limit(1);
    return Boolean(row);
  }
  async findStaffByTournament(tournamentId: string, role?: string) {
    const conditions: SQL[] = [
      eq(schema.tournamentStaff.tournamentId, tournamentId),
    ];
    if (role) conditions.push(eq(schema.tournamentStaff.role, role));
    const rows = await this.db
      .select({
        userId: schema.tournamentStaff.userId,
        role: schema.tournamentStaff.role,
        fullName: schema.profiles.fullName,
        email: schema.users.email,
        avatarUrl: schema.profiles.avatarUrl,
      })
      .from(schema.tournamentStaff)
      .innerJoin(
        schema.users,
        eq(schema.tournamentStaff.userId, schema.users.id),
      )
      .leftJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
      .where(and(...conditions));
    // Người được mời chưa có hồ sơ (profiles) vẫn phải xuất hiện trong danh sách
    // — dùng leftJoin + fallback để không bị lọc mất khi chưa tạo hồ sơ.
    return rows.map((row) => ({
      ...row,
      fullName: row.fullName || row.email,
      avatarUrl: row.avatarUrl || null,
    }));
  }
  async addReferee(tournamentId: string, userId: string, assignedBy: string) {
    const [existing] = await this.db
      .select()
      .from(schema.tournamentReferees)
      .where(
        and(
          eq(schema.tournamentReferees.tournamentId, tournamentId),
          eq(schema.tournamentReferees.userId, userId),
        ),
      )
      .limit(1);

    if (existing) {
      if (existing.status !== 'INVITED') {
        await this.db
          .update(schema.tournamentReferees)
          .set({ status: 'INVITED', assignedBy, assignedAt: new Date() })
          .where(eq(schema.tournamentReferees.id, existing.id));
        return {
          ...existing,
          status: 'INVITED',
          assignedBy,
          assignedAt: new Date(),
        };
      }
      return existing;
    }

    const [referee] = await this.db
      .insert(schema.tournamentReferees)
      .values({
        tournamentId,
        userId,
        assignedBy,
        status: 'INVITED',
      })
      .returning();
    return referee;
  }
  async findRefereeById(refereeId: string) {
    const [ref] = await this.db
      .select()
      .from(schema.tournamentReferees)
      .where(eq(schema.tournamentReferees.id, refereeId))
      .limit(1);
    return ref || null;
  }
  async findRefereeByTournamentAndUser(tournamentId: string, userId: string) {
    const [referee] = await this.db
      .select()
      .from(schema.tournamentReferees)
      .where(
        and(
          eq(schema.tournamentReferees.tournamentId, tournamentId),
          eq(schema.tournamentReferees.userId, userId),
        ),
      )
      .limit(1);
    return referee || null;
  }
  async updateRefereeStatus(
    refereeId: string,
    status: 'ACCEPTED' | 'DECLINED',
  ) {
    const [updated] = await this.db
      .update(schema.tournamentReferees)
      .set({ status, assignedAt: new Date() })
      .where(eq(schema.tournamentReferees.id, refereeId))
      .returning();
    return updated;
  }
  async removeRefereeInvite(refereeId: string) {
    const [removed] = await this.db
      .delete(schema.tournamentReferees)
      .where(eq(schema.tournamentReferees.id, refereeId))
      .returning();
    return removed || null;
  }
  async followTournament(tournamentId: string, userId: string) {
    const [existing] = await this.db
      .select()
      .from(schema.tournamentFollows)
      .where(
        and(
          eq(schema.tournamentFollows.tournamentId, tournamentId),
          eq(schema.tournamentFollows.userId, userId),
        ),
      )
      .limit(1);

    if (existing) return existing;

    const [follow] = await this.db
      .insert(schema.tournamentFollows)
      .values({ tournamentId, userId })
      .returning();
    return follow;
  }
  async unfollowTournament(tournamentId: string, userId: string) {
    await this.db
      .delete(schema.tournamentFollows)
      .where(
        and(
          eq(schema.tournamentFollows.tournamentId, tournamentId),
          eq(schema.tournamentFollows.userId, userId),
        ),
      );
  }
  async getFollowedTournamentIds(userId: string): Promise<string[]> {
    const rows = await this.db
      .select({ tournamentId: schema.tournamentFollows.tournamentId })
      .from(schema.tournamentFollows)
      .where(eq(schema.tournamentFollows.userId, userId));
    return rows.map((r) => r.tournamentId);
  }
  async getFollowerUserIds(tournamentId: string): Promise<string[]> {
    const rows = await this.db
      .select({ userId: schema.tournamentFollows.userId })
      .from(schema.tournamentFollows)
      .where(eq(schema.tournamentFollows.tournamentId, tournamentId));
    return rows.map((r) => r.userId);
  }
  async getFollowedTournaments(userId: string) {
    return this.db
      .select()
      .from(schema.tournamentFollows)
      .innerJoin(
        schema.tournaments,
        eq(schema.tournamentFollows.tournamentId, schema.tournaments.id),
      )
      .where(eq(schema.tournamentFollows.userId, userId));
  }
}
