"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.communityGallery = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const communities_schema_1 = require("./communities.schema");
const users_schema_1 = require("./users.schema");
exports.communityGallery = (0, pg_core_1.pgTable)('community_gallery', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    communityId: (0, pg_core_1.uuid)('community_id')
        .references(() => communities_schema_1.communities.id, { onDelete: 'cascade' })
        .notNull(),
    uploaderId: (0, pg_core_1.uuid)('uploader_id')
        .references(() => users_schema_1.users.id, { onDelete: 'set null' }),
    imageUrl: (0, pg_core_1.text)('image_url').notNull(),
    caption: (0, pg_core_1.varchar)('caption', { length: 500 }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true })
        .defaultNow()
        .notNull(),
});
//# sourceMappingURL=community_gallery.schema.js.map