import { Injectable, Inject } from '@nestjs/common';
import { PG_CONNECTION } from '../../database/database.module';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../../database/schema';
import { eq, ilike, sql, SQL, or, count } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';
import { CreateVenueDto } from './dto/create-venue.dto';
import { UpdateVenueDto } from './dto/update-venue.dto';
import { QueryVenueDto } from './dto/query-venue.dto';
import { CreateVenueCourtDto } from './dto/create-venue-court.dto';

@Injectable()
export class VenuesRepository {
  constructor(
    @Inject(PG_CONNECTION) private readonly db: NodePgDatabase<typeof schema>,
    private readonly auditService: AuditService,
  ) {}

  async findAll(query: QueryVenueDto) {
    const { page = 1, limit = 10, search } = query;
    const offset = (page - 1) * limit;

    let conditions: SQL | undefined = undefined;
    if (search) {
      conditions = or(
        ilike(schema.tournamentVenues.name, `%${search}%`),
        ilike(schema.tournamentVenues.locationAddress, `%${search}%`),
      );
    }

    const [totalRecord] = await this.db
      .select({ count: count() })
      .from(schema.tournamentVenues)
      .where(conditions);

    const venues = await this.db
      .select()
      .from(schema.tournamentVenues)
      .where(conditions)
      .limit(limit)
      .offset(offset);

    return {
      data: venues,
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
      .from(schema.tournamentVenues)
      .where(eq(schema.tournamentVenues.id, id))
      .limit(1);

    if (result.length === 0) return null;
    return result[0];
  }

  async create(userId: string, data: CreateVenueDto) {
    let geographyValue: SQL | null = null;
    if (data.longitude && data.latitude) {
      geographyValue = sql`ST_SetSRID(ST_MakePoint(${data.longitude}, ${data.latitude}), 4326)`;
    }

    return await this.db.transaction(async (tx) => {
      const [record] = await tx
        .insert(schema.tournamentVenues)
        .values({
          name: data.name,
          locationAddress: data.locationAddress,
          ...(geographyValue !== null && { locationGeolocation: geographyValue }),
          imagesUrls: data.imagesUrls,
        } as typeof schema.tournamentVenues.$inferInsert)
        .returning();

      await this.auditService.logCreate(tx, userId, 'tournament_venues', record.id, record);
      return record;
    });
  }

  async update(id: string, userId: string, data: UpdateVenueDto) {
    let geographyValue: SQL | undefined = undefined;
    if (data.longitude && data.latitude) {
      geographyValue = sql`ST_SetSRID(ST_MakePoint(${data.longitude}, ${data.latitude}), 4326)`;
    }

    return await this.db.transaction(async (tx) => {
      const [oldRecord] = await tx.select().from(schema.tournamentVenues).where(eq(schema.tournamentVenues.id, id)).limit(1);

      const [updated] = await tx
        .update(schema.tournamentVenues)
        .set({
          ...(data.name && { name: data.name }),
          ...(data.locationAddress && { locationAddress: data.locationAddress }),
          ...(geographyValue !== undefined && { locationGeolocation: geographyValue }),
          ...(data.imagesUrls && { imagesUrls: data.imagesUrls }),
        })
        .where(eq(schema.tournamentVenues.id, id))
        .returning();

      await this.auditService.logUpdate(tx, userId, 'tournament_venues', id, oldRecord, updated);
      return updated;
    });
  }

  async delete(id: string) {
    const [deleted] = await this.db
      .delete(schema.tournamentVenues)
      .where(eq(schema.tournamentVenues.id, id))
      .returning();
    return deleted;
  }

  // --- COURTS ---

  async findCourtsByVenue(venueId: string) {
    return this.db
      .select()
      .from(schema.venueCourts)
      .where(eq(schema.venueCourts.venueId, venueId));
  }

  async addCourt(venueId: string, data: CreateVenueCourtDto) {
    const [court] = await this.db
      .insert(schema.venueCourts)
      .values({
        venueId,
        courtName: data.courtName,
        status: data.status || 'AVAILABLE',
      })
      .returning();
    return court;
  }

  async removeCourt(courtId: string) {
    const [deleted] = await this.db
      .delete(schema.venueCourts)
      .where(eq(schema.venueCourts.id, courtId))
      .returning();
    return deleted;
  }
}
