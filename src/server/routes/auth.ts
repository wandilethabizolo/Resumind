import crypto from 'crypto';
import { Router } from 'express';
import { and, desc, eq, ne } from 'drizzle-orm';
import { db, runQuery } from '../../db/index.ts';
import {
  cvDocuments,
  jobApplications,
  notifications,
  organizationMembers,
  organizations,
  posts,
  profiles,
  sessions,
  users,
} from '../../db/schema.ts';
import { AuthRequest, requireAuth } from '../middleware/auth.ts';
import { getClientIp, recordAuditEvent } from '../services/audit.ts';

const router = Router();

router.post('/session', requireAuth, async (req: AuthRequest, res) => {
  try {
    const dbUser = req.dbUser!;

    let sessionKey = req.headers['x-session-key'] as string | undefined;
    let activeSession = req.sessionRecord;

    if (sessionKey && !activeSession) {
      const found = await runQuery('auth.findActiveSession', () =>
        db
          .select()
          .from(sessions)
          .where(and(eq(sessions.sessionKey, sessionKey!), eq(sessions.userId, dbUser.id)))
          .limit(1)
      );
      if (found[0] && !found[0].revoked && found[0].expiresAt > new Date()) {
        activeSession = found[0];
      }
    }

    if (!activeSession) {
      sessionKey = crypto.randomBytes(24).toString('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const inserted = await runQuery('auth.createSession', () =>
        db
          .insert(sessions)
          .values({
            userId: dbUser.id,
            sessionKey: sessionKey!,
            userAgent: (req.headers['user-agent'] || '').slice(0, 255),
            ipAddress: getClientIp(req),
            mfaVerified: true,
            expiresAt,
          })
          .returning()
      );
      activeSession = inserted[0];
    }

    const [profile] = await runQuery('auth.getProfile', () =>
      db.select().from(profiles).where(eq(profiles.userId, dbUser.id)).limit(1)
    );

    const orgRows = await runQuery('auth.getUserOrgs', () =>
      db
        .select({
          organization: organizations,
          memberRole: organizationMembers.role,
        })
        .from(organizationMembers)
        .innerJoin(
          organizations,
          eq(organizationMembers.organizationId, organizations.id)
        )
        .where(
          and(
            eq(organizationMembers.userId, dbUser.id),
            eq(organizationMembers.status, 'active')
          )
        )
    );

    const unreadNotifs = await runQuery('auth.unreadNotifs', () =>
      db
        .select()
        .from(notifications)
        .where(and(eq(notifications.userId, dbUser.id), eq(notifications.read, false)))
    );

    res.json({
      sessionKey,
      mfaVerified: activeSession.mfaVerified,
      user: {
        id: dbUser.id,
        uid: dbUser.uid,
        email: dbUser.email,
        fullName: dbUser.fullName,
        role: dbUser.role,
        status: dbUser.status,
        mfaEnabled: dbUser.mfaEnabled,
        emailVerified: dbUser.emailVerified,
      },
      profile: profile || null,
      organizations: orgRows.map((r) => ({ ...r.organization, memberRole: r.memberRole })),
      unreadNotifications: unreadNotifs.length,
    });
  } catch (error) {
    console.error('Session initialization error:', error);
    res.status(500).json({ error: 'Unable to initialize session' });
  }
});

router.get('/sessions', requireAuth, async (req: AuthRequest, res) => {
  try {
    const rows = await runQuery('auth.listSessions', () =>
      db
        .select({
          id: sessions.id,
          userAgent: sessions.userAgent,
          ipAddress: sessions.ipAddress,
          mfaVerified: sessions.mfaVerified,
          revoked: sessions.revoked,
          lastActiveAt: sessions.lastActiveAt,
          expiresAt: sessions.expiresAt,
          createdAt: sessions.createdAt,
          isCurrent: eq(sessions.sessionKey, (req.headers['x-session-key'] as string) || ''),
        })
        .from(sessions)
        .where(eq(sessions.userId, req.dbUser!.id))
        .orderBy(desc(sessions.lastActiveAt))
    );
    res.json({ sessions: rows });
  } catch {
    res.status(500).json({ error: 'Failed to load active sessions' });
  }
});

router.post('/sessions/:id/revoke', requireAuth, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid session ID' });
  }
  const updated = await runQuery('auth.revokeSession', () =>
    db
      .update(sessions)
      .set({ revoked: true })
      .where(and(eq(sessions.id, id), eq(sessions.userId, req.dbUser!.id)))
      .returning()
  );
  if (!updated[0]) {
    return res.status(404).json({ error: 'Session not found' });
  }
  await recordAuditEvent({
    actorId: req.dbUser!.id,
    action: 'session.revoked',
    targetType: 'session',
    targetId: id,
    ipAddress: getClientIp(req),
  });
  res.json({ revoked: true });
});

router.post('/sessions/revoke-others', requireAuth, async (req: AuthRequest, res) => {
  const currentKey = (req.headers['x-session-key'] as string) || '';
  await runQuery('auth.revokeOtherSessions', () =>
    db
      .update(sessions)
      .set({ revoked: true })
      .where(
        and(
          eq(sessions.userId, req.dbUser!.id),
          ne(sessions.sessionKey, currentKey)
        )
      )
  );
  await recordAuditEvent({
    actorId: req.dbUser!.id,
    action: 'session.revoked_others',
    targetType: 'user',
    targetId: req.dbUser!.id,
    ipAddress: getClientIp(req),
  });
  res.json({ revokedOthers: true });
});

router.post('/logout', requireAuth, async (req: AuthRequest, res) => {
  const sessionKey = req.headers['x-session-key'];
  if (typeof sessionKey === 'string' && sessionKey.length > 8) {
    await runQuery('auth.logoutRevoke', () =>
      db
        .update(sessions)
        .set({ revoked: true })
        .where(and(eq(sessions.sessionKey, sessionKey), eq(sessions.userId, req.dbUser!.id)))
    );
  }
  res.json({ loggedOut: true });
});

router.get('/export', requireAuth, async (req: AuthRequest, res) => {
  const userId = req.dbUser!.id;
  const [profile] = await runQuery('export.profile', () =>
    db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1)
  );
  const userPosts = await runQuery('export.posts', () =>
    db.select().from(posts).where(eq(posts.authorId, userId))
  );
  const userApps = await runQuery('export.apps', () =>
    db.select().from(jobApplications).where(eq(jobApplications.applicantId, userId))
  );
  const userCvs = await runQuery('export.cvs', () =>
    db.select().from(cvDocuments).where(eq(cvDocuments.userId, userId))
  );

  res.json({
    exportedAt: new Date().toISOString(),
    account: {
      id: req.dbUser!.id,
      email: req.dbUser!.email,
      fullName: req.dbUser!.fullName,
      role: req.dbUser!.role,
      createdAt: req.dbUser!.createdAt,
    },
    profile,
    posts: userPosts,
    applications: userApps,
    cvDocuments: userCvs,
  });
});

router.delete('/account', requireAuth, async (req: AuthRequest, res) => {
  const userId = req.dbUser!.id;
  await recordAuditEvent({
    actorId: userId,
    action: 'user.account_deleted',
    targetType: 'user',
    targetId: userId,
    ipAddress: getClientIp(req),
  });
  await runQuery('auth.deleteAccount', () => db.delete(users).where(eq(users.id, userId)));
  res.json({ deleted: true });
});

export default router;
