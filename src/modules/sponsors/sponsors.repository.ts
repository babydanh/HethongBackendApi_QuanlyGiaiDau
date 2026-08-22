import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gte, isNull, lte, ne, or } from 'drizzle-orm';
import { PG_CONNECTION } from '../../database/database.module';
import type { AppDb } from '../../database/db.types';
import * as schema from '../../database/schema';
import type { NewTournamentSponsor } from '../../database/schema/tournament_sponsors.schema';

const publicSponsorFields = {
  id: schema.tournamentSponsors.id,
  displayName: schema.tournamentSponsors.displayName,
  tier: schema.tournamentSponsors.tier,
  logoUrl: schema.tournamentSponsors.logoUrl,
  websiteUrl: schema.tournamentSponsors.websiteUrl,
  shortDescription: schema.tournamentSponsors.shortDescription,
  displayOrder: schema.tournamentSponsors.displayOrder,
} as const;

const organizerSponsorFields = {
  ...publicSponsorFields,
  tournamentId: schema.tournamentSponsors.tournamentId,
  status: schema.tournamentSponsors.status,
  isPublic: schema.tournamentSponsors.isPublic,
  startAt: schema.tournamentSponsors.startAt,
  endAt: schema.tournamentSponsors.endAt,
  createdBy: schema.tournamentSponsors.createdBy,
  updatedBy: schema.tournamentSponsors.updatedBy,
  createdAt: schema.tournamentSponsors.createdAt,
  updatedAt: schema.tournamentSponsors.updatedAt,
  archivedAt: schema.tournamentSponsors.archivedAt,
} as const;

@Injectable()
export class SponsorsRepository {
  constructor(@Inject(PG_CONNECTION) private readonly db: AppDb) {}

  async findTournamentForAccess(tournamentId: string) {
    const [tournament] = await this.db
      .select({
        id: schema.tournaments.id,
        createdBy: schema.tournaments.createdBy,
        communityId: schema.tournaments.communityId,
        visibility: schema.tournaments.visibility,
        status: schema.tournaments.status,
        deletedAt: schema.tournaments.deletedAt,
      })
      .from(schema.tournaments)
      .where(eq(schema.tournaments.id, tournamentId))
      .limit(1);

    return tournament ?? null;
  }

  async isCoOrganizer(tournamentId: string, userId: string) {
    const [staff] = await this.db
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

    return Boolean(staff);
  }

  async findCommunityMember(communityId: string, userId: string) {
    const [member] = await this.db
      .select({ status: schema.communityMembers.status, role: schema.communityMembers.role })
      .from(schema.communityMembers)
      .where(
        and(
          eq(schema.communityMembers.communityId, communityId),
          eq(schema.communityMembers.userId, userId),
        ),
      )
      .limit(1);

    return member ?? null;
  }

  async listForOrganizer(tournamentId: string) {
    return this.db
      .select(organizerSponsorFields)
      .from(schema.tournamentSponsors)
      .where(
        and(
          eq(schema.tournamentSponsors.tournamentId, tournamentId),
          isNull(schema.tournamentSponsors.deletedAt),
        ),
      )
      .orderBy(asc(schema.tournamentSponsors.displayOrder), asc(schema.tournamentSponsors.createdAt));
  }

  async listForPublic(tournamentId: string, now = new Date()) {
    return this.db
      .select(publicSponsorFields)
      .from(schema.tournamentSponsors)
      .innerJoin(
        schema.tournaments,
        eq(schema.tournamentSponsors.tournamentId, schema.tournaments.id),
      )
      .where(
        and(
          eq(schema.tournamentSponsors.tournamentId, tournamentId),
          eq(schema.tournamentSponsors.status, 'PUBLISHED'),
          eq(schema.tournamentSponsors.isPublic, true),
          isNull(schema.tournamentSponsors.archivedAt),
          isNull(schema.tournamentSponsors.deletedAt),
          eq(schema.tournaments.visibility, 'PUBLIC'),
          ne(schema.tournaments.status, 'DRAFT'),
          ne(schema.tournaments.status, 'CANCELLED'),
          isNull(schema.tournaments.deletedAt),
          or(isNull(schema.tournamentSponsors.startAt), lte(schema.tournamentSponsors.startAt, now)),
          or(isNull(schema.tournamentSponsors.endAt), gte(schema.tournamentSponsors.endAt, now)),
        ),
      )
      .orderBy(asc(schema.tournamentSponsors.displayOrder), asc(schema.tournamentSponsors.createdAt));
  }

  async findById(tournamentId: string, sponsorId: string) {
    const [sponsor] = await this.db
      .select(organizerSponsorFields)
      .from(schema.tournamentSponsors)
      .where(
        and(
          eq(schema.tournamentSponsors.id, sponsorId),
          eq(schema.tournamentSponsors.tournamentId, tournamentId),
          isNull(schema.tournamentSponsors.deletedAt),
        ),
      )
      .limit(1);

    return sponsor ?? null;
  }

  async create(values: NewTournamentSponsor) {
    const [sponsor] = await this.db
      .insert(schema.tournamentSponsors)
      .values(values)
      .returning();

    return sponsor ?? null;
  }

  async update(tournamentId: string, sponsorId: string, values: Partial<NewTournamentSponsor>) {
    const [sponsor] = await this.db
      .update(schema.tournamentSponsors)
      .set({ ...values, updatedAt: new Date() })
      .where(
        and(
          eq(schema.tournamentSponsors.id, sponsorId),
          eq(schema.tournamentSponsors.tournamentId, tournamentId),
          isNull(schema.tournamentSponsors.deletedAt),
        ),
      )
      .returning();

    return sponsor ?? null;
  }

  async archive(tournamentId: string, sponsorId: string, userId: string) {
    const now = new Date();
    const [sponsor] = await this.db
      .update(schema.tournamentSponsors)
      .set({
        status: 'ARCHIVED',
        archivedAt: now,
        updatedBy: userId,
        updatedAt: now,
      })
      .where(
        and(
          eq(schema.tournamentSponsors.id, sponsorId),
          eq(schema.tournamentSponsors.tournamentId, tournamentId),
          isNull(schema.tournamentSponsors.deletedAt),
        ),
      )
      .returning();

    return sponsor ?? null;
  }
}
