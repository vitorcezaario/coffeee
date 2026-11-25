import { relations } from 'drizzle-orm';
import {
  boolean,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  username: text('username').unique(),
  email: text('email').notNull(),
  passwordHash: text('password_hash'),
  role: text('role').notNull().default('viewer'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const adminSessions = pgTable('admin_sessions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const siteSettings = pgTable('site_settings', {
  id: serial('id').primaryKey(),
  siteName: text('site_name').notNull().default('coffee'),
  footerDescription: text('footer_description')
    .notNull()
    .default('arquivo pessoal, feito para portifolios customizados'),
  contactEmail: text('contact_email')
    .notNull()
    .default('vitorcezario1@hotmail.com'),
  footerCredit: text('footer_credit')
    .notNull()
    .default('feito por vitor cezario'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const portfolioItems = pgTable('portfolio_items', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  title: text('title').notNull().default(''),
  kind: text('kind').notNull(), // 'foto' | 'video'
  aspect: text('aspect').notNull().default('portrait'), // 'portrait' | 'landscape' | 'square'
  mimeType: text('mime_type').notNull(),
  fileData: text('file_data').notNull(), // base64 stored in PostgreSQL for durability
  duration: text('duration'),
  sortOrder: integer('sort_order').notNull().default(0),
  published: boolean('published').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  items: many(portfolioItems),
  sessions: many(adminSessions),
}));

export const adminSessionsRelations = relations(adminSessions, ({ one }) => ({
  user: one(users, {
    fields: [adminSessions.userId],
    references: [users.id],
  }),
}));

export const portfolioItemsRelations = relations(portfolioItems, ({ one }) => ({
  owner: one(users, {
    fields: [portfolioItems.userId],
    references: [users.id],
  }),
}));
