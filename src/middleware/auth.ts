import type { Request, Response, NextFunction } from 'express';
import { findValidAdminSession } from '../db/repository.ts';
import { hashSessionToken } from '../lib/admin-auth.ts';

export const SESSION_COOKIE_NAME = 'coffee_admin_session';
export const SESSION_TTL_HOURS = 24 * 30; // 30 days
export const SESSION_MAX_AGE_SECONDS = SESSION_TTL_HOURS * 60 * 60;

export interface AuthRequest extends Request {
  adminUser?: {
    id: number;
    username: string;
    email: string;
    role: string;
  };
  sessionTokenHash?: string;
}

export function extractCookie(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const eqIndex = part.indexOf('=');
    if (eqIndex === -1) continue;
    const key = part.slice(0, eqIndex).trim();
    if (key === name) {
      try {
        return decodeURIComponent(part.slice(eqIndex + 1).trim());
      } catch {
        return part.slice(eqIndex + 1).trim();
      }
    }
  }
  return null;
}

export function setSessionCookie(res: Response, rawToken: string): void {
  const cookieValue = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(rawToken)}`,
    'Path=/',
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
    'HttpOnly',
    'Secure',
    'SameSite=None',
    'Partitioned',
  ].join('; ');
  res.setHeader('Set-Cookie', cookieValue);
}

export function clearSessionCookie(res: Response): void {
  const cookieValue = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    'HttpOnly',
    'Secure',
    'SameSite=None',
    'Partitioned',
  ].join('; ');
  res.setHeader('Set-Cookie', cookieValue);
}

export function verifyCsrfRequest(req: Request): boolean {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return true;
  }

  const customHeader = req.headers['x-requested-with'];
  const hasCustomHeader =
    typeof customHeader === 'string' &&
    (customHeader === 'coffee-admin' || customHeader === 'XMLHttpRequest');

  const originHeader = req.headers.origin;
  const forwardedHost = req.headers['x-forwarded-host'];
  const rawHost = Array.isArray(forwardedHost)
    ? forwardedHost[0]
    : forwardedHost || req.headers.host || '';
  const expectedHost = rawHost.split(',')[0].trim().toLowerCase();

  let originMatches = false;
  if (typeof originHeader === 'string' && expectedHost) {
    try {
      const originHost = new URL(originHeader).host.toLowerCase();
      originMatches = originHost === expectedHost;
    } catch {
      originMatches = false;
    }
  }

  // If Origin is present, it must match our host; otherwise require the custom header
  if (typeof originHeader === 'string') {
    return originMatches && hasCustomHeader;
  }
  return hasCustomHeader;
}

export async function verifyAdminRequest(req: Request) {
  let rawToken: string | null = null;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    rawToken = authHeader.slice('Bearer '.length).trim();
  }

  if (!rawToken) {
    rawToken = extractCookie(req.headers.cookie, SESSION_COOKIE_NAME);
  }

  if (!rawToken || rawToken.length < 24 || rawToken.length > 256) {
    return null;
  }

  const tokenHash = hashSessionToken(rawToken);
  const session = await findValidAdminSession(tokenHash);
  if (!session) return null;

  return {
    user: session.user,
    tokenHash,
  };
}

export const requireAdmin = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  if (!verifyCsrfRequest(req)) {
    res.status(403).json({ error: 'Requisição bloqueada por validação de origem.' });
    return;
  }

  try {
    const verified = await verifyAdminRequest(req);
    if (!verified) {
      res.status(401).json({ error: 'Sessão inválida ou expirada. Faça login novamente.' });
      return;
    }
    req.adminUser = verified.user;
    req.sessionTokenHash = verified.tokenHash;
    next();
  } catch (error) {
    console.error('Admin session verification failed:', error);
    res.status(401).json({ error: 'Não foi possível validar a sessão.' });
  }
};
