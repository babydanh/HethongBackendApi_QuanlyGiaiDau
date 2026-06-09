import { pgTable, uuid, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { communities } from './communities.schema';
import { users } from './users.schema';

export const communityGallery = pgTable('community_gallery', {
  id: uuid('id').primaryKey().defaultRandom(),
  communityId: uuid('community_id')
    .references(() => communities.id, { onDelete: 'cascade' })
    .notNull(),
  uploaderId: uuid('uploader_id')
    .references(() => users.id, { onDelete: 'set null' }),
  imageUrl: text('image_url').notNull(),
  caption: varchar('caption', { length: 500 }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});
