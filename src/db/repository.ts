import { and, asc, desc, eq, gt, isNotNull, lt, ne, sql } from 'drizzle-orm';
import { db } from './index.ts';
import { adminSessions, portfolioItems, siteSettings, users } from './schema.ts';

export const DEFAULT_SETTINGS = {
  siteName: 'coffee',
  footerDescription: 'arquivo pessoal, feito para portifolios customizados',
  contactEmail: 'vitorcezario1@hotmail.com',
  footerCredit: 'feito por vitor cezario',
};

export interface PortfolioItemSummary {
  id: number;
  title: string;
  kind: 'foto' | 'video';
  aspect: 'portrait' | 'landscape' | 'square';
  mimeType: string;
  duration: string | null;
  displayWidth: number | null;
  sortOrder: number;
  published: boolean;
  createdAt: string;
  mediaUrl: string;
}

export interface SiteSettingsDTO {
  siteName: string;
  footerDescription: string;
  contactEmail: string;
  footerCredit: string;
}

export interface AdminUserRecord {
  id: number;
  username: string;
  email: string;
  role: string;
  passwordHash: string | null;
}

export async function getStandaloneAdminAccount(): Promise<AdminUserRecord | null> {
  try {
    const rows = await db
      .select()
      .from(users)
      .where(and(eq(users.role, 'admin'), isNotNull(users.passwordHash)))
      .orderBy(asc(users.id))
      .limit(1);

    if (rows.length === 0) return null;
    const row = rows[0];
    return {
      id: row.id,
      username: row.username || 'admin',
      email: row.email,
      role: row.role,
      passwordHash: row.passwordHash,
    };
  } catch (error) {
    console.error('Failed to query admin account:', error);
    throw new Error('Não foi possível consultar o administrador.', { cause: error });
  }
}

export async function ensureEnvAdminUser(preferredUsername: string): Promise<AdminUserRecord> {
  try {
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.role, 'admin'))
      .orderBy(asc(users.id))
      .limit(1);

    if (existing.length > 0) {
      const row = existing[0];
      return {
        id: row.id,
        username: preferredUsername || row.username || 'admin',
        email: row.email,
        role: row.role,
        passwordHash: row.passwordHash,
      };
    }

    const uname = preferredUsername || 'admin';
    const inserted = await db
      .insert(users)
      .values({
        uid: `local-admin:${uname}`,
        username: uname,
        email: DEFAULT_SETTINGS.contactEmail,
        role: 'admin',
      })
      .returning();

    const row = inserted[0];
    return {
      id: row.id,
      username: row.username || uname,
      email: row.email,
      role: row.role,
      passwordHash: row.passwordHash,
    };
  } catch (error) {
    console.error('Failed to ensure env admin user:', error);
    throw new Error('Não foi possível inicializar o administrador.', { cause: error });
  }
}

export async function claimFirstAdminAccount(
  username: string,
  passwordHash: string,
): Promise<AdminUserRecord | null> {
  try {
    return await db.transaction(async (tx) => {
      // Serialize concurrent first-run setup attempts with a transaction-scoped advisory lock
      await tx.execute(sql`SELECT pg_advisory_xact_lock(72849103)`);
      const claimed = await tx
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.role, 'admin'), isNotNull(users.passwordHash)))
        .limit(1);

      if (claimed.length > 0) {
        return null;
      }

      const existingAdmin = await tx
        .select()
        .from(users)
        .where(eq(users.role, 'admin'))
        .orderBy(asc(users.id))
        .limit(1);

      if (existingAdmin.length > 0) {
        const updated = await tx
          .update(users)
          .set({
            username,
            passwordHash,
            role: 'admin',
          })
          .where(eq(users.id, existingAdmin[0].id))
          .returning();

        const row = updated[0];
        return {
          id: row.id,
          username: row.username || username,
          email: row.email,
          role: row.role,
          passwordHash: row.passwordHash,
        };
      }

      const inserted = await tx
        .insert(users)
        .values({
          uid: `local-admin:${username}`,
          username,
          email: DEFAULT_SETTINGS.contactEmail,
          passwordHash,
          role: 'admin',
        })
        .returning();

      const row = inserted[0];
      return {
        id: row.id,
        username: row.username || username,
        email: row.email,
        role: row.role,
        passwordHash: row.passwordHash,
      };
    });
  } catch (error) {
    console.error('Failed to claim admin account:', error);
    throw new Error('Não foi possível criar a conta de administrador.', { cause: error });
  }
}

export async function updateAdminCredentials(
  userId: number,
  username: string,
  passwordHash: string,
): Promise<AdminUserRecord | null> {
  try {
    const updated = await db
      .update(users)
      .set({ username, passwordHash })
      .where(and(eq(users.id, userId), eq(users.role, 'admin')))
      .returning();

    if (updated.length === 0) return null;
    const row = updated[0];
    return {
      id: row.id,
      username: row.username || username,
      email: row.email,
      role: row.role,
      passwordHash: row.passwordHash,
    };
  } catch (error) {
    console.error('Failed to update admin credentials:', error);
    throw new Error('Não foi possível atualizar as credenciais.', { cause: error });
  }
}

export async function createAdminSession(
  userId: number,
  tokenHash: string,
  ttlHours = 24,
): Promise<void> {
  try {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlHours * 60 * 60 * 1000);
    await db.delete(adminSessions).where(lt(adminSessions.expiresAt, now));
    await db.insert(adminSessions).values({
      userId,
      tokenHash,
      expiresAt,
    });
  } catch (error) {
    console.error('Failed to create admin session:', error);
    throw new Error('Não foi possível iniciar a sessão.', { cause: error });
  }
}

export async function findValidAdminSession(
  tokenHash: string,
): Promise<{
  sessionId: number;
  user: { id: number; username: string; email: string; role: string };
} | null> {
  try {
    const now = new Date();
    const rows = await db
      .select({
        sessionId: adminSessions.id,
        userId: users.id,
        username: users.username,
        email: users.email,
        role: users.role,
      })
      .from(adminSessions)
      .innerJoin(users, eq(adminSessions.userId, users.id))
      .where(
        and(
          eq(adminSessions.tokenHash, tokenHash),
          gt(adminSessions.expiresAt, now),
          eq(users.role, 'admin'),
        ),
      )
      .limit(1);

    if (rows.length === 0) return null;
    const row = rows[0];
    return {
      sessionId: row.sessionId,
      user: {
        id: row.userId,
        username: row.username || 'admin',
        email: row.email,
        role: row.role,
      },
    };
  } catch (error) {
    console.error('Failed to validate admin session:', error);
    return null;
  }
}

export async function deleteAdminSession(tokenHash: string): Promise<void> {
  try {
    await db.delete(adminSessions).where(eq(adminSessions.tokenHash, tokenHash));
  } catch (error) {
    console.error('Failed to delete admin session:', error);
  }
}

export async function revokeOtherAdminSessions(
  userId: number,
  keepTokenHash: string,
): Promise<void> {
  try {
    await db
      .delete(adminSessions)
      .where(
        and(
          eq(adminSessions.userId, userId),
          ne(adminSessions.tokenHash, keepTokenHash),
        ),
      );
  } catch (error) {
    console.error('Failed to revoke other admin sessions:', error);
  }
}

export async function getSiteSettings(): Promise<SiteSettingsDTO> {
  try {
    const rows = await db.select().from(siteSettings).orderBy(asc(siteSettings.id)).limit(1);
    if (rows.length === 0) {
      const inserted = await db
        .insert(siteSettings)
        .values(DEFAULT_SETTINGS)
        .returning();
      return {
        siteName: inserted[0].siteName,
        footerDescription: inserted[0].footerDescription,
        contactEmail: inserted[0].contactEmail,
        footerCredit: inserted[0].footerCredit,
      };
    }
    return {
      siteName: rows[0].siteName,
      footerDescription: rows[0].footerDescription,
      contactEmail: rows[0].contactEmail,
      footerCredit: rows[0].footerCredit,
    };
  } catch (error) {
    console.error('Failed to read site settings:', error);
    throw new Error('Não foi possível carregar as configurações do site.', { cause: error });
  }
}

export async function updateSiteSettings(input: Partial<SiteSettingsDTO>): Promise<SiteSettingsDTO> {
  try {
    const existing = await db.select().from(siteSettings).orderBy(asc(siteSettings.id)).limit(1);
    const nextValues = {
      siteName: (input.siteName ?? existing[0]?.siteName ?? DEFAULT_SETTINGS.siteName).trim() || 'coffee',
      footerDescription: (
        input.footerDescription ??
        existing[0]?.footerDescription ??
        DEFAULT_SETTINGS.footerDescription
      ).trim(),
      contactEmail: (
        input.contactEmail ??
        existing[0]?.contactEmail ??
        DEFAULT_SETTINGS.contactEmail
      ).trim(),
      footerCredit: (
        input.footerCredit ??
        existing[0]?.footerCredit ??
        DEFAULT_SETTINGS.footerCredit
      ).trim(),
      updatedAt: new Date(),
    };

    if (existing.length === 0) {
      const created = await db.insert(siteSettings).values(nextValues).returning();
      return {
        siteName: created[0].siteName,
        footerDescription: created[0].footerDescription,
        contactEmail: created[0].contactEmail,
        footerCredit: created[0].footerCredit,
      };
    }

    const updated = await db
      .update(siteSettings)
      .set(nextValues)
      .where(eq(siteSettings.id, existing[0].id))
      .returning();

    return {
      siteName: updated[0].siteName,
      footerDescription: updated[0].footerDescription,
      contactEmail: updated[0].contactEmail,
      footerCredit: updated[0].footerCredit,
    };
  } catch (error) {
    console.error('Failed to update site settings:', error);
    throw new Error('Não foi possível salvar as configurações.', { cause: error });
  }
}

export async function listPortfolioItems(includeDrafts: boolean): Promise<PortfolioItemSummary[]> {
  try {
    const baseQuery = db
      .select({
        id: portfolioItems.id,
        title: portfolioItems.title,
        kind: portfolioItems.kind,
        aspect: portfolioItems.aspect,
        mimeType: portfolioItems.mimeType,
        duration: portfolioItems.duration,
        displayWidth: portfolioItems.displayWidth,
        sortOrder: portfolioItems.sortOrder,
        published: portfolioItems.published,
        createdAt: portfolioItems.createdAt,
      })
      .from(portfolioItems);

    const rows = includeDrafts
      ? await baseQuery.orderBy(asc(portfolioItems.sortOrder), desc(portfolioItems.createdAt))
      : await baseQuery
          .where(eq(portfolioItems.published, true))
          .orderBy(asc(portfolioItems.sortOrder), desc(portfolioItems.createdAt));

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      kind: row.kind === 'video' ? 'video' : 'foto',
      aspect:
        row.aspect === 'landscape' || row.aspect === 'square'
          ? row.aspect
          : 'portrait',
      mimeType: row.mimeType,
      duration: row.duration,
      displayWidth: row.displayWidth ?? null,
      sortOrder: row.sortOrder,
      published: row.published,
      createdAt: row.createdAt.toISOString(),
      mediaUrl: `/api/media/${row.id}/file`,
    }));
  } catch (error) {
    console.error('Failed to list portfolio items:', error);
    throw new Error('Não foi possível carregar o portfólio.', { cause: error });
  }
}

export async function getPortfolioMediaFile(id: number) {
  try {
    const rows = await db
      .select({
        id: portfolioItems.id,
        mimeType: portfolioItems.mimeType,
        fileData: portfolioItems.fileData,
        published: portfolioItems.published,
      })
      .from(portfolioItems)
      .where(eq(portfolioItems.id, id))
      .limit(1);

    return rows[0] ?? null;
  } catch (error) {
    console.error('Failed to fetch media binary:', error);
    throw new Error('Não foi possível carregar o arquivo.', { cause: error });
  }
}

export async function createPortfolioItem(params: {
  userId: number;
  title: string;
  kind: 'foto' | 'video';
  aspect: 'portrait' | 'landscape' | 'square';
  mimeType: string;
  fileData: string;
  duration?: string | null;
  published?: boolean;
}): Promise<PortfolioItemSummary> {
  try {
    const minRow = await db
      .select({ minOrder: sql<number>`coalesce(min(${portfolioItems.sortOrder}), 1)::int` })
      .from(portfolioItems);
    const nextSortOrder = (minRow[0]?.minOrder ?? 1) - 1;

    const inserted = await db
      .insert(portfolioItems)
      .values({
        userId: params.userId,
        title: params.title.trim(),
        kind: params.kind,
        aspect: params.aspect,
        mimeType: params.mimeType,
        fileData: params.fileData,
        duration: params.duration ?? null,
        sortOrder: nextSortOrder,
        published: params.published ?? true,
      })
      .returning({
        id: portfolioItems.id,
        title: portfolioItems.title,
        kind: portfolioItems.kind,
        aspect: portfolioItems.aspect,
        mimeType: portfolioItems.mimeType,
        duration: portfolioItems.duration,
        displayWidth: portfolioItems.displayWidth,
        sortOrder: portfolioItems.sortOrder,
        published: portfolioItems.published,
        createdAt: portfolioItems.createdAt,
      });

    const row = inserted[0];
    return {
      id: row.id,
      title: row.title,
      kind: row.kind === 'video' ? 'video' : 'foto',
      aspect:
        row.aspect === 'landscape' || row.aspect === 'square'
          ? row.aspect
          : 'portrait',
      mimeType: row.mimeType,
      duration: row.duration,
      displayWidth: row.displayWidth ?? null,
      sortOrder: row.sortOrder,
      published: row.published,
      createdAt: row.createdAt.toISOString(),
      mediaUrl: `/api/media/${row.id}/file`,
    };
  } catch (error) {
    console.error('Failed to create portfolio item:', error);
    throw new Error('Não foi possível salvar a mídia no banco de dados.', { cause: error });
  }
}

export async function updatePortfolioItem(
  id: number,
  updates: {
    title?: string;
    aspect?: 'portrait' | 'landscape' | 'square';
    published?: boolean;
    displayWidth?: number | null;
    sortOrder?: number;
  },
): Promise<PortfolioItemSummary | null> {
  try {
    const setPayload: Partial<typeof portfolioItems.$inferInsert> = {};
    if (typeof updates.title === 'string') setPayload.title = updates.title.trim();
    if (
      updates.aspect === 'portrait' ||
      updates.aspect === 'landscape' ||
      updates.aspect === 'square'
    ) {
      setPayload.aspect = updates.aspect;
    }
    if (typeof updates.published === 'boolean') setPayload.published = updates.published;
    if (updates.displayWidth === null) {
      setPayload.displayWidth = null;
    } else if (
      typeof updates.displayWidth === 'number' &&
      Number.isFinite(updates.displayWidth)
    ) {
      setPayload.displayWidth = Math.max(15, Math.min(100, Math.round(updates.displayWidth)));
    }
    if (typeof updates.sortOrder === 'number' && Number.isFinite(updates.sortOrder)) {
      setPayload.sortOrder = Math.trunc(updates.sortOrder);
    }

    const updated = await db
      .update(portfolioItems)
      .set(setPayload)
      .where(eq(portfolioItems.id, id))
      .returning({
        id: portfolioItems.id,
        title: portfolioItems.title,
        kind: portfolioItems.kind,
        aspect: portfolioItems.aspect,
        mimeType: portfolioItems.mimeType,
        duration: portfolioItems.duration,
        displayWidth: portfolioItems.displayWidth,
        sortOrder: portfolioItems.sortOrder,
        published: portfolioItems.published,
        createdAt: portfolioItems.createdAt,
      });

    if (updated.length === 0) return null;
    const row = updated[0];
    return {
      id: row.id,
      title: row.title,
      kind: row.kind === 'video' ? 'video' : 'foto',
      aspect:
        row.aspect === 'landscape' || row.aspect === 'square'
          ? row.aspect
          : 'portrait',
      mimeType: row.mimeType,
      duration: row.duration,
      displayWidth: row.displayWidth ?? null,
      sortOrder: row.sortOrder,
      published: row.published,
      createdAt: row.createdAt.toISOString(),
      mediaUrl: `/api/media/${row.id}/file`,
    };
  } catch (error) {
    console.error('Failed to update portfolio item:', error);
    throw new Error('Não foi possível atualizar o item.', { cause: error });
  }
}

export async function reorderPortfolioItems(orderedIds: number[]) {
  try {
    await db.transaction(async (tx) => {
      for (let i = 0; i < orderedIds.length; i += 1) {
        await tx
          .update(portfolioItems)
          .set({ sortOrder: i + 1 })
          .where(eq(portfolioItems.id, orderedIds[i]));
      }
    });
  } catch (error) {
    console.error('Failed to reorder portfolio items:', error);
    throw new Error('Não foi possível reordenar o portfólio.', { cause: error });
  }
}

export async function deletePortfolioItem(id: number): Promise<boolean> {
  try {
    const deleted = await db
      .delete(portfolioItems)
      .where(eq(portfolioItems.id, id))
      .returning({ id: portfolioItems.id });
    return deleted.length > 0;
  } catch (error) {
    console.error('Failed to delete portfolio item:', error);
    throw new Error('Não foi possível excluir o item.', { cause: error });
  }
}
