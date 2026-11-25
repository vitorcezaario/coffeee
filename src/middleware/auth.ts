import type { Request, Response, NextFunction } from 'express';
import { findValidAdminSession } from '../db/repository.ts';
import { hashSessionToken } from '../lib/admin-auth.ts';

export interface AuthRequest extends Request {
  adminUser?: {
    id: number;
    username: string;
    email: string;
    role: string;
  };
  sessionTokenHash?: string;
}

export async function verifyAdminHeader(authHeader?: string) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const rawToken = authHeader.slice('Bearer '.length).trim();
  if (rawToken.length < 24 || rawToken.length > 256) return null;

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
  try {
    const verified = await verifyAdminHeader(req.headers.authorization);
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
