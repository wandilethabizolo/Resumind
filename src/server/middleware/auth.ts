import { NextFunction, Request, Response } from 'express';
import { DecodedIdToken } from 'firebase-admin/auth';
import { and, eq } from 'drizzle-orm';
import { adminAuth } from '../../lib/firebase-admin.ts';
import { db, runQuery } from '../../db/index.ts';
import {
  organizationMembers,
  profiles,
  sessions,
  users,
} from '../../db/schema.ts';
import { getClientIp, recordAuditEvent } from '../services/audit.ts';

export type DbUser = typeof users.$inferSelect;

export interface AuthRequest extends Request {
  firebaseUser?: DecodedIdToken;
  dbUser?: DbUser;
  sessionRecord?: typeof sessions.$inferSelect;
}

export async function upsertAuthenticatedUser(decoded: DecodedIdToken): Promise<DbUser> {
  const email = (decoded.email || `${decoded.uid}@resumind.local`).toLowerCase();
  const fullName = decoded.name || email.split('@')[0] || 'ResuMind Member';

  const existingByUid = await runQuery('auth.findByUid', () =>
    db.select().from(users).where(eq(users.uid, decoded.uid)).limit(1)
  );

  let dbUser = existingByUid[0];

  if (!dbUser && decoded.email) {
    const existingByEmail = await runQuery('auth.findByEmail', () =>
      db.select().from(users).where(eq(users.email, email)).limit(1)
    );
    if (existingByEmail[0]) {
      const updated = await runQuery('auth.relinkUid', () =>
        db
          .update(users)
          .set({
            uid: decoded.uid,
            emailVerified: Boolean(decoded.email_verified ?? true),
            updatedAt: new Date(),
          })
          .where(eq(users.id, existingByEmail[0].id))
          .returning()
      );
      dbUser = updated[0];
    }
  }

  if (!dbUser) {
    const inserted = await runQuery('auth.upsertUser', () =>
      db
        .insert(users)
        .values({
          uid: decoded.uid,
          email,
          fullName,
          role: 'user',
          emailVerified: Boolean(decoded.email_verified ?? true),
        })
        .onConflictDoUpdate({
          target: users.uid,
          set: {
            email,
            updatedAt: new Date(),
          },
        })
        .returning()
    );
    dbUser = inserted[0];

    await recordAuditEvent({
      actorId: dbUser.id,
      action: 'user.registered',
      targetType: 'user',
      targetId: dbUser.id,
      metadata: { email, role: dbUser.role },
    });
  }

  // Always guarantee a profile row exists for authenticated users
  await runQuery('auth.ensureProfile', () =>
    db
      .insert(profiles)
      .values({
        userId: dbUser.id,
        headline: 'Professional on ResuMind',
        avatarUrl: decoded.picture || '',
        coverUrl: '',
        location: 'Mbabane',
        country: 'Eswatini',
      })
      .onConflictDoNothing()
  );

  return dbUser;
}

export async function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const dbUser = await upsertAuthenticatedUser(decoded);

    if (dbUser.status === 'suspended') {
      return res.status(403).json({
        error: 'Your account has been suspended.',
      });
    }

    const isSessionBootstrap =
      req.method === 'POST' && req.baseUrl === '/api/auth' && req.path === '/session';
    const sessionKey = req.headers['x-session-key'];

    if (!isSessionBootstrap && typeof sessionKey === 'string' && sessionKey.length > 8) {
      const sessRows = await runQuery('auth.checkSession', () =>
        db
          .select()
          .from(sessions)
          .where(and(eq(sessions.sessionKey, sessionKey), eq(sessions.userId, dbUser.id)))
          .limit(1)
      );
      if (sessRows[0]) {
        if (sessRows[0].revoked || sessRows[0].expiresAt < new Date()) {
          return res.status(401).json({
            error: 'Session has been revoked or expired. Please sign in again.',
            code: 'SESSION_REVOKED',
          });
        }
        req.sessionRecord = sessRows[0];
        await runQuery('auth.touchSession', () =>
          db
            .update(sessions)
            .set({ lastActiveAt: new Date(), ipAddress: getClientIp(req) })
            .where(eq(sessions.id, sessRows[0].id))
        );
      }
    }

    req.firebaseUser = decoded;
    req.dbUser = dbUser;
    next();
  } catch (error) {
    console.error('Firebase token verification error:', error);
    return res.status(401).json({ error: 'Invalid or expired authentication token' });
  }
}

export async function optionalAuth(
  req: AuthRequest,
  _res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) return next();
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const dbUser = await upsertAuthenticatedUser(decoded);
    if (dbUser.status !== 'suspended') {
      req.firebaseUser = decoded;
      req.dbUser = dbUser;
    }
  } catch {
    // Ignore invalid optional token and proceed anonymously
  }
  next();
}

export function requireRole(allowedRoles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.dbUser) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!allowedRoles.includes(req.dbUser.role)) {
      return res.status(403).json({ error: 'Insufficient platform permissions' });
    }
    next();
  };
}

export async function getUserOrgMembership(organizationId: number, userId: number) {
  const rows = await runQuery('auth.getOrgMember', () =>
    db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, organizationId),
          eq(organizationMembers.userId, userId),
          eq(organizationMembers.status, 'active')
        )
      )
      .limit(1)
  );
  return rows[0] ?? null;
}

export function requireOrgRole(allowedOrgRoles: string[]) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.dbUser) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const orgId = Number(req.params.id || req.params.orgId || req.body.organizationId);
    if (!Number.isInteger(orgId) || orgId <= 0) {
      return res.status(400).json({ error: 'Invalid organization ID' });
    }
    const membership = await getUserOrgMembership(orgId, req.dbUser.id);
    if (!membership || !allowedOrgRoles.includes(membership.role)) {
      return res.status(403).json({
        error: 'You do not have the required organization permissions.',
      });
    }
    next();
  };
}
