import express from 'express';
import type { Express, Request, Response } from 'express';
import multer from 'multer';
import { ensureExternalSchema, isDatabaseConfigured } from '../db/index.ts';
import {
  claimFirstAdminAccount,
  createAdminSession,
  createPortfolioItem,
  DEFAULT_SETTINGS,
  deleteAdminSession,
  deletePortfolioItem,
  ensureEnvAdminUser,
  getPortfolioMediaFile,
  getSiteSettings,
  getStandaloneAdminAccount,
  listPortfolioItems,
  reorderPortfolioItems,
  revokeOtherAdminSessions,
  updateAdminCredentials,
  updatePortfolioItem,
  updatePortfolioLayoutBatch,
  updateSiteSettings,
} from '../db/repository.ts';
import {
  generateSessionToken,
  getEnvAdminPasscode,
  getEnvAdminUsername,
  hashPassword,
  isValidUsername,
  normalizeUsername,
  timingSafeStringEqual,
  verifyPassword,
} from '../lib/admin-auth.ts';
import {
  clearSessionCookie,
  requireAdmin,
  SESSION_TTL_HOURS,
  setSessionCookie,
  verifyAdminRequest,
  verifyCsrfRequest,
} from '../middleware/auth.ts';
import type { AuthRequest } from '../middleware/auth.ts';

const ALLOWED_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

const ALLOWED_VIDEO_MIMES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
]);

const ALLOWED_MIMES = new Set([...ALLOWED_IMAGE_MIMES, ...ALLOWED_VIDEO_MIMES]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25 MB max per upload
  },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Formato não suportado. Use JPG, PNG, WEBP, GIF, MP4, WEBM ou MOV.'));
    }
  },
});

// Simple per-IP rate limiter for admin login / setup / password-change attempts
const AUTH_WINDOW_MS = 15 * 60 * 1000;
const AUTH_MAX_ATTEMPTS = 12;
const authAttempts = new Map<string, { count: number; resetAt: number }>();

function checkAuthRateLimit(req: Request): boolean {
  const now = Date.now();
  const forwarded = req.headers['x-forwarded-for'];
  const firstForwarded = Array.isArray(forwarded)
    ? forwarded[0]
    : typeof forwarded === 'string'
      ? forwarded.split(',')[0].trim()
      : '';
  const key = firstForwarded || req.ip || req.socket.remoteAddress || 'unknown';
  const entry = authAttempts.get(key);
  if (!entry || entry.resetAt <= now) {
    authAttempts.set(key, { count: 1, resetAt: now + AUTH_WINDOW_MS });
    return true;
  }
  if (entry.count >= AUTH_MAX_ATTEMPTS) {
    return false;
  }
  entry.count += 1;
  return true;
}

function clearAuthRateLimit(req: Request): void {
  const forwarded = req.headers['x-forwarded-for'];
  const firstForwarded = Array.isArray(forwarded)
    ? forwarded[0]
    : typeof forwarded === 'string'
      ? forwarded.split(',')[0].trim()
      : '';
  const key = firstForwarded || req.ip || req.socket.remoteAddress || 'unknown';
  authAttempts.delete(key);
}

function parsePositiveId(raw: string): number | null {
  const num = Number(raw);
  if (!Number.isInteger(num) || num <= 0) return null;
  return num;
}

export function createApiApp(): Express {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.use('/api', async (_req: Request, res: Response, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    try {
      await ensureExternalSchema();
    } catch (err) {
      console.error('External schema check failed:', err);
    }
    next();
  });

  // Public portfolio feed (published items + site settings)
  app.get('/api/portfolio', async (_req: Request, res: Response) => {
    if (!isDatabaseConfigured()) {
      res.json({ settings: DEFAULT_SETTINGS, items: [] });
      return;
    }
    try {
      const [settings, items] = await Promise.all([
        getSiteSettings(),
        listPortfolioItems(false),
      ]);
      res.json({ settings, items });
    } catch (error) {
      console.error('GET /api/portfolio failed:', error);
      res.status(503).json({
        settings: DEFAULT_SETTINGS,
        items: [],
        error: 'Não foi possível carregar o acervo agora.',
      });
    }
  });

  // Stream stored photo or video binary with Range support for video scrubbing
  app.get('/api/media/:id/file', async (req: Request, res: Response) => {
    const id = parsePositiveId(String(req.params.id || ''));
    if (!id) {
      res.status(400).json({ error: 'ID inválido.' });
      return;
    }

    try {
      const fileRecord = await getPortfolioMediaFile(id);
      if (!fileRecord) {
        res.status(404).end();
        return;
      }

      if (!fileRecord.published) {
        const verified = await verifyAdminRequest(req);
        if (!verified) {
          res.status(404).end();
          return;
        }
      }

      const safeMime = ALLOWED_MIMES.has(fileRecord.mimeType)
        ? fileRecord.mimeType
        : 'application/octet-stream';

      const buffer = Buffer.from(fileRecord.fileData, 'base64');
      const totalLength = buffer.length;

      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Type', safeMime);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader(
        'Cache-Control',
        fileRecord.published ? 'public, max-age=3600' : 'private, no-store',
      );

      const rangeHeader = req.headers.range;
      if (rangeHeader && rangeHeader.startsWith('bytes=')) {
        const [startStr, endStr] = rangeHeader.replace('bytes=', '').split('-');
        const start = Number.parseInt(startStr, 10);
        const end = endStr ? Number.parseInt(endStr, 10) : totalLength - 1;

        if (
          Number.isNaN(start) ||
          Number.isNaN(end) ||
          start < 0 ||
          end >= totalLength ||
          start > end
        ) {
          res.status(416).setHeader('Content-Range', `bytes */${totalLength}`).end();
          return;
        }

        const chunk = buffer.subarray(start, end + 1);
        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${totalLength}`);
        res.setHeader('Content-Length', String(chunk.length));
        res.send(chunk);
        return;
      }

      res.setHeader('Content-Length', String(totalLength));
      res.send(buffer);
    } catch (error) {
      console.error('GET /api/media/:id/file failed:', error);
      res.status(500).end();
    }
  });

  // Standalone Admin Auth: check if first-run setup is needed
  app.get('/api/admin/auth/status', async (_req: Request, res: Response) => {
    if (!isDatabaseConfigured()) {
      res.status(503).json({
        error:
          'Banco de dados PostgreSQL não configurado no servidor. Defina DATABASE_URL nas variáveis de ambiente.',
      });
      return;
    }

    try {
      const envPasscode = getEnvAdminPasscode();
      if (envPasscode.length > 0) {
        res.json({ needsSetup: false, envPasscodeActive: true });
        return;
      }
      const existing = await getStandaloneAdminAccount();
      res.json({ needsSetup: existing === null, envPasscodeActive: false });
    } catch (error) {
      console.error('GET /api/admin/auth/status failed:', error);
      res.status(500).json({ error: 'Não foi possível verificar o status do acesso.' });
    }
  });

  // Standalone Admin Auth: restore active persistent session (silent, returns authenticated boolean)
  app.get('/api/admin/auth/me', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Vary', 'Cookie, Authorization');
    if (!isDatabaseConfigured()) {
      res.json({ authenticated: false });
      return;
    }

    try {
      const verified = await verifyAdminRequest(req);
      if (!verified) {
        res.json({ authenticated: false });
        return;
      }
      res.json({
        authenticated: true,
        username: verified.user.username,
        envPasscodeActive: getEnvAdminPasscode().length > 0,
      });
    } catch {
      res.json({ authenticated: false });
    }
  });

  // Standalone Admin Auth: one-time first-run claim (locked once claimed or when ADMIN_PASSCODE env is set)
  app.post('/api/admin/auth/setup', async (req: Request, res: Response) => {
    if (!verifyCsrfRequest(req)) {
      res.status(403).json({ error: 'Requisição bloqueada por validação de origem.' });
      return;
    }

    if (!isDatabaseConfigured()) {
      res.status(503).json({
        error: 'Banco de dados PostgreSQL não configurado no servidor.',
      });
      return;
    }

    if (!checkAuthRateLimit(req)) {
      res.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos.' });
      return;
    }

    if (getEnvAdminPasscode().length > 0) {
      res.status(403).json({ error: 'Acesso já configurado.' });
      return;
    }

    const rawUsername = typeof req.body?.username === 'string' ? req.body.username : '';
    const rawPassword = typeof req.body?.password === 'string' ? req.body.password : '';
    const username = normalizeUsername(rawUsername);

    if (!isValidUsername(username)) {
      res.status(400).json({
        error: 'Usuário deve ter de 3 a 32 caracteres (letras, números, ponto, hífen ou underline).',
      });
      return;
    }

    if (rawPassword.length < 8 || rawPassword.length > 128) {
      res.status(400).json({
        error: 'A senha deve ter entre 8 e 128 caracteres.',
      });
      return;
    }

    try {
      const passwordHash = hashPassword(rawPassword);
      const claimedUser = await claimFirstAdminAccount(username, passwordHash);
      if (!claimedUser) {
        res.status(403).json({ error: 'O acesso de administrador já foi configurado.' });
        return;
      }

      const { rawToken, tokenHash } = generateSessionToken();
      await createAdminSession(claimedUser.id, tokenHash, SESSION_TTL_HOURS);
      setSessionCookie(res, rawToken);
      clearAuthRateLimit(req);

      res.status(201).json({
        token: rawToken,
        username: claimedUser.username,
        envPasscodeActive: false,
      });
    } catch (error) {
      console.error('POST /api/admin/auth/setup failed:', error);
      res.status(500).json({ error: 'Erro ao configurar o administrador.' });
    }
  });

  // Standalone Admin Auth: login with username & password
  app.post('/api/admin/auth/login', async (req: Request, res: Response) => {
    if (!verifyCsrfRequest(req)) {
      res.status(403).json({ error: 'Requisição bloqueada por validação de origem.' });
      return;
    }

    if (!isDatabaseConfigured()) {
      res.status(503).json({
        error: 'Banco de dados PostgreSQL não configurado no servidor.',
      });
      return;
    }

    if (!checkAuthRateLimit(req)) {
      res.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos.' });
      return;
    }

    const rawUsername = typeof req.body?.username === 'string' ? req.body.username : '';
    const rawPassword = typeof req.body?.password === 'string' ? req.body.password : '';
    const username = normalizeUsername(rawUsername);

    if (!username || !rawPassword || rawPassword.length > 128) {
      res.status(400).json({ error: 'Informe usuário e senha.' });
      return;
    }

    try {
      const envPasscode = getEnvAdminPasscode();

      // Configured process.env.ADMIN_PASSCODE always overrides any claimed fallback hash
      if (envPasscode.length > 0) {
        const expectedUser = getEnvAdminUsername() || 'admin';
        const userOk = timingSafeStringEqual(username, expectedUser);
        const passOk = timingSafeStringEqual(rawPassword, envPasscode);
        if (!userOk || !passOk) {
          res.status(401).json({ error: 'Usuário ou senha inválidos.' });
          return;
        }

        const adminUser = await ensureEnvAdminUser(expectedUser);
        const { rawToken, tokenHash } = generateSessionToken();
        await createAdminSession(adminUser.id, tokenHash, SESSION_TTL_HOURS);
        setSessionCookie(res, rawToken);
        clearAuthRateLimit(req);

        res.json({
          token: rawToken,
          username: expectedUser,
          envPasscodeActive: true,
        });
        return;
      }

      const account = await getStandaloneAdminAccount();
      if (!account || !account.passwordHash) {
        res.status(400).json({ error: 'Configure a senha inicial de administrador primeiro.' });
        return;
      }

      const userOk = timingSafeStringEqual(username, account.username.toLowerCase());
      const passOk = verifyPassword(rawPassword, account.passwordHash);
      if (!userOk || !passOk) {
        res.status(401).json({ error: 'Usuário ou senha inválidos.' });
        return;
      }

      const { rawToken, tokenHash } = generateSessionToken();
      await createAdminSession(account.id, tokenHash, SESSION_TTL_HOURS);
      setSessionCookie(res, rawToken);
      clearAuthRateLimit(req);

      res.json({
        token: rawToken,
        username: account.username,
        envPasscodeActive: false,
      });
    } catch (error) {
      console.error('POST /api/admin/auth/login failed:', error);
      res.status(500).json({ error: 'Não foi possível realizar o login.' });
    }
  });

  // Standalone Admin Auth: logout (revokes session in PostgreSQL & clears HttpOnly cookie)
  app.post('/api/admin/auth/logout', async (req: Request, res: Response) => {
    if (!verifyCsrfRequest(req)) {
      res.status(403).json({ error: 'Requisição bloqueada por validação de origem.' });
      return;
    }

    try {
      const verified = await verifyAdminRequest(req);
      if (verified?.tokenHash) {
        await deleteAdminSession(verified.tokenHash);
      }
    } catch (error) {
      console.error('Logout session cleanup error:', error);
    }

    clearSessionCookie(res);
    res.json({ ok: true });
  });

  // Standalone Admin Auth: change username / password (when not overridden by env secret)
  app.post('/api/admin/auth/change-password', requireAdmin, async (req: AuthRequest, res: Response) => {
    if (!checkAuthRateLimit(req)) {
      res.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos.' });
      return;
    }

    if (getEnvAdminPasscode().length > 0) {
      res.status(400).json({
        error: 'A senha é gerenciada pelas variáveis de ambiente do servidor.',
      });
      return;
    }

    const currentPassword =
      typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
    const newPassword =
      typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
    const rawNewUsername =
      typeof req.body?.username === 'string' ? req.body.username : req.adminUser?.username || '';
    const newUsername = normalizeUsername(rawNewUsername);

    if (!isValidUsername(newUsername)) {
      res.status(400).json({
        error: 'Usuário deve ter de 3 a 32 caracteres (letras, números, ponto, hífen ou underline).',
      });
      return;
    }

    if (newPassword.length < 8 || newPassword.length > 128) {
      res.status(400).json({ error: 'A nova senha deve ter entre 8 e 128 caracteres.' });
      return;
    }

    try {
      const account = await getStandaloneAdminAccount();
      if (!account || !account.passwordHash || !verifyPassword(currentPassword, account.passwordHash)) {
        res.status(401).json({ error: 'Senha atual incorreta.' });
        return;
      }

      const nextHash = hashPassword(newPassword);
      const updated = await updateAdminCredentials(account.id, newUsername, nextHash);
      if (!updated) {
        res.status(404).json({ error: 'Conta não encontrada.' });
        return;
      }

      if (req.sessionTokenHash) {
        await revokeOtherAdminSessions(account.id, req.sessionTokenHash);
      }

      res.json({ ok: true, username: updated.username });
    } catch (error) {
      console.error('POST /api/admin/auth/change-password failed:', error);
      res.status(500).json({ error: 'Erro ao atualizar a senha.' });
    }
  });

  // Admin: list all items (published + drafts) + settings
  app.get('/api/admin/overview', requireAdmin, async (_req: AuthRequest, res: Response) => {
    try {
      const [settings, items] = await Promise.all([
        getSiteSettings(),
        listPortfolioItems(true),
      ]);
      res.json({ settings, items });
    } catch (error) {
      console.error('GET /api/admin/overview failed:', error);
      res.status(500).json({ error: 'Erro ao carregar dados do admin.' });
    }
  });

  // Admin: upload photo or video
  app.post('/api/admin/items', requireAdmin, (req: AuthRequest, res: Response) => {
    upload.single('file')(req, res, async (uploadErr) => {
      if (uploadErr) {
        res.status(400).json({ error: uploadErr.message || 'Erro no envio do arquivo.' });
        return;
      }

      const file = req.file;
      if (!file) {
        res.status(400).json({ error: 'Selecione uma foto ou vídeo.' });
        return;
      }

      const isVideo = ALLOWED_VIDEO_MIMES.has(file.mimetype);
      const rawTitle = typeof req.body.title === 'string' ? req.body.title.slice(0, 160) : '';
      const rawAspect = typeof req.body.aspect === 'string' ? req.body.aspect : '';
      const aspect: 'portrait' | 'landscape' | 'square' =
        rawAspect === 'landscape' || rawAspect === 'square' || rawAspect === 'portrait'
          ? rawAspect
          : isVideo
            ? 'landscape'
            : 'portrait';

      const rawDuration =
        typeof req.body.duration === 'string' && req.body.duration.trim().length > 0
          ? req.body.duration.trim().slice(0, 12)
          : null;
      const published = req.body.published !== 'false';

      try {
        const created = await createPortfolioItem({
          userId: req.adminUser!.id,
          title: rawTitle,
          kind: isVideo ? 'video' : 'foto',
          aspect,
          mimeType: file.mimetype,
          fileData: file.buffer.toString('base64'),
          duration: isVideo ? rawDuration : null,
          published,
        });
        res.status(201).json(created);
      } catch (error) {
        console.error('POST /api/admin/items failed:', error);
        res.status(500).json({ error: 'Erro ao salvar a mídia no banco de dados.' });
      }
    });
  });

  // Admin: update item metadata (title, aspect, published)
  app.patch('/api/admin/items/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
    const id = parsePositiveId(String(req.params.id || ''));
    if (!id) {
      res.status(400).json({ error: 'ID inválido.' });
      return;
    }

    try {
      const updates: {
        title?: string;
        aspect?: 'portrait' | 'landscape' | 'square';
        published?: boolean;
        displayWidth?: number | null;
        displayHeight?: number | null;
        posX?: number | null;
        posY?: number | null;
        zIndex?: number;
      } = {};

      if (typeof req.body.title === 'string') {
        updates.title = req.body.title.slice(0, 160);
      }
      if (
        req.body.aspect === 'portrait' ||
        req.body.aspect === 'landscape' ||
        req.body.aspect === 'square'
      ) {
        updates.aspect = req.body.aspect;
      }
      if (typeof req.body.published === 'boolean') {
        updates.published = req.body.published;
      }
      if (req.body.displayWidth === null) {
        updates.displayWidth = null;
      } else if (
        typeof req.body.displayWidth === 'number' &&
        Number.isFinite(req.body.displayWidth)
      ) {
        updates.displayWidth = Math.max(5, Math.min(100, Math.round(req.body.displayWidth)));
      }
      if (req.body.displayHeight === null) {
        updates.displayHeight = null;
      } else if (
        typeof req.body.displayHeight === 'number' &&
        Number.isFinite(req.body.displayHeight)
      ) {
        updates.displayHeight = Math.max(60, Math.min(3000, Math.round(req.body.displayHeight)));
      }
      if (req.body.posX === null) {
        updates.posX = null;
      } else if (typeof req.body.posX === 'number' && Number.isFinite(req.body.posX)) {
        updates.posX = Math.max(0, Math.min(95, Math.round(req.body.posX * 10) / 10));
      }
      if (req.body.posY === null) {
        updates.posY = null;
      } else if (typeof req.body.posY === 'number' && Number.isFinite(req.body.posY)) {
        updates.posY = Math.max(0, Math.min(20000, Math.round(req.body.posY)));
      }
      if (typeof req.body.zIndex === 'number' && Number.isFinite(req.body.zIndex)) {
        updates.zIndex = Math.max(1, Math.min(10000, Math.trunc(req.body.zIndex)));
      }

      if (Object.keys(updates).length === 0) {
        res.status(400).json({ error: 'Nenhuma alteração enviada.' });
        return;
      }

      const updated = await updatePortfolioItem(id, updates);
      if (!updated) {
        res.status(404).json({ error: 'Item não encontrado.' });
        return;
      }
      res.json(updated);
    } catch (error) {
      console.error('PATCH /api/admin/items/:id failed:', error);
      res.status(500).json({ error: 'Erro ao atualizar item.' });
    }
  });

  // Admin: batch update freeform canvas positions & sizes
  app.post('/api/admin/items/layout', requireAdmin, async (req: AuthRequest, res: Response) => {
    const rawEntries = req.body?.entries;
    if (!Array.isArray(rawEntries) || rawEntries.length === 0 || rawEntries.length > 500) {
      res.status(400).json({ error: 'Layout inválido.' });
      return;
    }

    const sanitized: Array<{
      id: number;
      displayWidth?: number | null;
      displayHeight?: number | null;
      posX?: number | null;
      posY?: number | null;
      zIndex?: number;
    }> = [];

    for (const raw of rawEntries) {
      if (!raw || typeof raw !== 'object') continue;
      const id = Number(raw.id);
      if (!Number.isInteger(id) || id <= 0) continue;
      const entry: (typeof sanitized)[number] = { id };
      if (raw.displayWidth === null || (typeof raw.displayWidth === 'number' && Number.isFinite(raw.displayWidth))) {
        entry.displayWidth = raw.displayWidth;
      }
      if (raw.displayHeight === null || (typeof raw.displayHeight === 'number' && Number.isFinite(raw.displayHeight))) {
        entry.displayHeight = raw.displayHeight;
      }
      if (raw.posX === null || (typeof raw.posX === 'number' && Number.isFinite(raw.posX))) {
        entry.posX = raw.posX;
      }
      if (raw.posY === null || (typeof raw.posY === 'number' && Number.isFinite(raw.posY))) {
        entry.posY = raw.posY;
      }
      if (typeof raw.zIndex === 'number' && Number.isFinite(raw.zIndex)) {
        entry.zIndex = raw.zIndex;
      }
      sanitized.push(entry);
    }

    if (sanitized.length === 0) {
      res.status(400).json({ error: 'Nenhum item válido enviado.' });
      return;
    }

    try {
      await updatePortfolioLayoutBatch(sanitized);
      res.json({ ok: true });
    } catch (error) {
      console.error('POST /api/admin/items/layout failed:', error);
      res.status(500).json({ error: 'Erro ao salvar o layout.' });
    }
  });

  // Admin: reorder items
  app.post('/api/admin/items/reorder', requireAdmin, async (req: AuthRequest, res: Response) => {
    const rawIds = req.body?.orderedIds ?? req.body?.ids;
    if (
      !Array.isArray(rawIds) ||
      rawIds.length === 0 ||
      rawIds.some((id) => !Number.isInteger(id) || id <= 0)
    ) {
      res.status(400).json({ error: 'Lista de ordem inválida.' });
      return;
    }

    try {
      await reorderPortfolioItems(rawIds);
      res.json({ ok: true });
    } catch (error) {
      console.error('POST /api/admin/items/reorder failed:', error);
      res.status(500).json({ error: 'Erro ao reordenar itens.' });
    }
  });

  // Admin: delete item
  app.delete('/api/admin/items/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
    const id = parsePositiveId(String(req.params.id || ''));
    if (!id) {
      res.status(400).json({ error: 'ID inválido.' });
      return;
    }

    try {
      const removed = await deletePortfolioItem(id);
      if (!removed) {
        res.status(404).json({ error: 'Item não encontrado.' });
        return;
      }
      res.json({ ok: true });
    } catch (error) {
      console.error('DELETE /api/admin/items/:id failed:', error);
      res.status(500).json({ error: 'Erro ao excluir item.' });
    }
  });

  // Admin: update site settings
  app.patch('/api/admin/settings', requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const siteName =
        typeof req.body.siteName === 'string' ? req.body.siteName.slice(0, 60) : undefined;
      const footerDescription =
        typeof req.body.footerDescription === 'string'
          ? req.body.footerDescription.slice(0, 240)
          : undefined;
      const contactEmail =
        typeof req.body.contactEmail === 'string'
          ? req.body.contactEmail.trim().slice(0, 120)
          : undefined;
      if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
        res.status(400).json({ error: 'E-mail de contato inválido.' });
        return;
      }
      const footerCredit =
        typeof req.body.footerCredit === 'string'
          ? req.body.footerCredit.slice(0, 120)
          : undefined;

      const updated = await updateSiteSettings({
        siteName,
        footerDescription,
        contactEmail,
        footerCredit,
      });
      res.json(updated);
    } catch (error) {
      console.error('PATCH /api/admin/settings failed:', error);
      res.status(500).json({ error: 'Erro ao atualizar configurações.' });
    }
  });

  return app;
}
