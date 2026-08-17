"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tournamentDivisions = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const tournaments_schema_1 = require("./tournaments.schema");
const venues_schema_1 = require("./venues.schema");
exports.tournamentDivisions = (0, pg_core_1.pgTable)('tournament_divisions', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    tournamentId: (0, pg_core_1.uuid)('tournament_id')
        .references(() => tournaments_schema_1.tournaments.id, { onDelete: 'cascade' })
        .notNull(),
    name: (0, pg_core_1.varchar)('name', { length: 255 }).notNull(),
    matchType: (0, pg_core_1.varchar)('match_type', { length: 50 }).notNull(),
    genderRestriction: (0, pg_core_1.varchar)('gender_restriction', { length: 20 }),
    maxParticipants: (0, pg_core_1.integer)('max_participants'),
    entryFee: (0, pg_core_1.numeric)('entry_fee', { precision: 12, scale: 2 })
        .default('0')
        .notNull(),
    isConfigOverride: (0, pg_core_1.boolean)('is_config_override').default(false).notNull(),
    venueId: (0, pg_core_1.uuid)('venue_id').references(() => venues_schema_1.tournamentVenues.id, {
        onDelete: 'set null',
    }),
    bracketType: (0, pg_core_1.varchar)('bracket_type', { length: 50 }),
    roundConfig: (0, pg_core_1.jsonb)('round_config'),
    startDate: (0, pg_core_1.timestamp)('start_date', { withTimezone: true }),
    registrationEndDate: (0, pg_core_1.timestamp)('registration_end_date', {
        withTimezone: true,
    }),
    minElo: (0, pg_core_1.integer)('min_elo'),
    maxElo: (0, pg_core_1.integer)('max_elo'),
    prizeDescription: (0, pg_core_1.text)('prize_description'),
    status: (0, pg_core_1.varchar)('status', { length: 50 }).default('DRAFT').notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true })
        .defaultNow()
        .notNull(),
});
//# sourceMappingURL=tournament_divisions.schema.js.map