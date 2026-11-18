import { Router } from 'express';
import { and, eq, ne, or } from 'drizzle-orm';
import { z } from 'zod';
import { db, runQuery } from '../../db/index.ts';
import { blocks, connections, follows, profiles, users } from '../../db/schema.ts';
import { AuthRequest, requireAuth } from '../middleware/auth.ts';
import { createNotification } from '../services/notifications.ts';

const router = Router();

router.get('/overview', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.dbUser!.id;

    const [allConns, myFollows, myBlocks, allPeople] = await Promise.all([
      runQuery('network.conns', () =>
        db
          .select()
          .from(connections)
          .where(or(eq(connections.requesterId, userId), eq(connections.recipientId, userId)))
      ),
      runQuery('network.follows', () =>
        db.select().from(follows).where(eq(follows.followerId, userId))
      ),
      runQuery('network.blocks', () =>
        db
          .select()
          .from(blocks)
          .where(or(eq(blocks.blockerId, userId), eq(blocks.blockedId, userId)))
      ),
      runQuery('network.people', () =>
        db
          .select({
            id: users.id,
            fullName: users.fullName,
            headline: profiles.headline,
            location: profiles.location,
            country: profiles.country,
            currentPosition: profiles.currentPosition,
            avatarUrl: profiles.avatarUrl,
            skills: profiles.skills,
            visibility: profiles.visibility,
          })
          .from(users)
          .innerJoin(profiles, eq(profiles.userId, users.id))
          .where(and(eq(users.status, 'active'), ne(users.id, userId), ne(profiles.visibility, 'private')))
          .limit(50)
      ),
    ]);

    const blockedSet = new Set(
      myBlocks.map((b) => (b.blockerId === userId ? b.blockedId : b.blockerId))
    );
    const followingSet = new Set(myFollows.map((f) => f.followingId));
    const peopleMap = new Map(allPeople.map((p) => [p.id, p]));

    const acceptedIds = new Set<number>();
    const pendingIncoming: Array<{ connectionId: number; user: (typeof allPeople)[number]; createdAt: Date }> = [];
    const pendingOutgoing: Array<{ connectionId: number; user: (typeof allPeople)[number]; createdAt: Date }> = [];

    for (const c of allConns) {
      const otherId = c.requesterId === userId ? c.recipientId : c.requesterId;
      if (blockedSet.has(otherId)) continue;
      const otherPerson = peopleMap.get(otherId);
      if (!otherPerson) continue;

      if (c.status === 'accepted') {
        acceptedIds.add(otherId);
      } else if (c.status === 'pending') {
        if (c.recipientId === userId) {
          pendingIncoming.push({ connectionId: c.id, user: otherPerson, createdAt: c.createdAt });
        } else {
          pendingOutgoing.push({ connectionId: c.id, user: otherPerson, createdAt: c.createdAt });
        }
      }
    }

    const connectedUsers = allPeople
      .filter((p) => acceptedIds.has(p.id))
      .map((p) => ({ ...p, isFollowing: followingSet.has(p.id) }));

    const connectedOrPendingIds = new Set([
      ...acceptedIds,
      ...pendingIncoming.map((i) => i.user.id),
      ...pendingOutgoing.map((o) => o.user.id),
    ]);

    const suggestions = allPeople
      .filter((p) => !blockedSet.has(p.id) && !connectedOrPendingIds.has(p.id))
      .map((p) => ({ ...p, isFollowing: followingSet.has(p.id) }));

    const blockedUsers = myBlocks
      .filter((b) => b.blockerId === userId)
      .map((b) => ({
        userId: b.blockedId,
        fullName: peopleMap.get(b.blockedId)?.fullName || `User #${b.blockedId}`,
        reason: b.reason,
      }));

    res.json({
      connections: connectedUsers,
      incomingRequests: pendingIncoming,
      outgoingRequests: pendingOutgoing,
      suggestions,
      blockedUsers,
      followingIds: Array.from(followingSet),
    });
  } catch {
    res.status(500).json({ error: 'Failed to load network overview' });
  }
});

router.post('/connect', requireAuth, async (req: AuthRequest, res) => {
  const parsed = z.object({ recipientId: z.number().int().positive() }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid recipientId' });
  }
  const userId = req.dbUser!.id;
  const recipientId = parsed.data.recipientId;
  if (recipientId === userId) {
    return res.status(400).json({ error: 'Cannot connect with yourself' });
  }

  const blocked = await runQuery('network.checkBlock', () =>
    db
      .select()
      .from(blocks)
      .where(
        or(
          and(eq(blocks.blockerId, userId), eq(blocks.blockedId, recipientId)),
          and(eq(blocks.blockerId, recipientId), eq(blocks.blockedId, userId))
        )
      )
      .limit(1)
  );
  if (blocked[0]) {
    return res.status(403).json({ error: 'Cannot send request to this user' });
  }

  const existing = await runQuery('network.checkExisting', () =>
    db
      .select()
      .from(connections)
      .where(
        or(
          and(eq(connections.requesterId, userId), eq(connections.recipientId, recipientId)),
          and(eq(connections.requesterId, recipientId), eq(connections.recipientId, userId))
        )
      )
      .limit(1)
  );

  if (existing[0]) {
    if (existing[0].status === 'rejected') {
      const updated = await runQuery('network.reRequest', () =>
        db
          .update(connections)
          .set({
            requesterId: userId,
            recipientId,
            status: 'pending',
            updatedAt: new Date(),
          })
          .where(eq(connections.id, existing[0].id))
          .returning()
      );
      return res.json({ connection: updated[0] });
    }
    return res.status(409).json({ error: `Connection already ${existing[0].status}` });
  }

  const inserted = await runQuery('network.insertConn', () =>
    db
      .insert(connections)
      .values({ requesterId: userId, recipientId, status: 'pending' })
      .returning()
  );

  await createNotification({
    userId: recipientId,
    actorId: userId,
    type: 'connection_request',
    title: `${req.dbUser!.fullName} sent you a connection invitation`,
    linkTab: 'network',
    entityId: inserted[0].id,
  });

  res.status(201).json({ connection: inserted[0] });
});

router.post('/requests/:id/respond', requireAuth, async (req: AuthRequest, res) => {
  const connectionId = Number(req.params.id);
  const parsed = z.object({ action: z.enum(['accept', 'reject']) }).safeParse(req.body);
  if (!Number.isInteger(connectionId) || connectionId <= 0 || !parsed.success) {
    return res.status(400).json({ error: 'Invalid request parameters' });
  }

  const userId = req.dbUser!.id;
  const rows = await runQuery('network.findReq', () =>
    db.select().from(connections).where(eq(connections.id, connectionId)).limit(1)
  );
  if (!rows[0] || rows[0].recipientId !== userId) {
    return res.status(404).json({ error: 'Connection request not found' });
  }

  const nextStatus = parsed.data.action === 'accept' ? 'accepted' : 'rejected';
  const updated = await runQuery('network.updateReq', () =>
    db
      .update(connections)
      .set({ status: nextStatus, updatedAt: new Date() })
      .where(eq(connections.id, connectionId))
      .returning()
  );

  if (nextStatus === 'accepted') {
    // Auto-follow mutually on connection accept
    await db
      .insert(follows)
      .values([
        { followerId: userId, followingId: rows[0].requesterId },
        { followerId: rows[0].requesterId, followingId: userId },
      ])
      .onConflictDoNothing();

    await createNotification({
      userId: rows[0].requesterId,
      actorId: userId,
      type: 'connection_accepted',
      title: `${req.dbUser!.fullName} accepted your connection invitation`,
      linkTab: 'network',
      entityId: connectionId,
    });
  }

  res.json({ connection: updated[0] });
});

router.delete('/connections/:targetUserId', requireAuth, async (req: AuthRequest, res) => {
  const targetUserId = Number(req.params.targetUserId);
  const userId = req.dbUser!.id;
  if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }

  await runQuery('network.disconnect', () =>
    db
      .delete(connections)
      .where(
        or(
          and(eq(connections.requesterId, userId), eq(connections.recipientId, targetUserId)),
          and(eq(connections.requesterId, targetUserId), eq(connections.recipientId, userId))
        )
      )
  );
  res.json({ removed: true });
});

router.post('/follow/:targetUserId', requireAuth, async (req: AuthRequest, res) => {
  const targetUserId = Number(req.params.targetUserId);
  const userId = req.dbUser!.id;
  if (!Number.isInteger(targetUserId) || targetUserId <= 0 || targetUserId === userId) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }

  const existing = await runQuery('network.checkFollow', () =>
    db
      .select()
      .from(follows)
      .where(and(eq(follows.followerId, userId), eq(follows.followingId, targetUserId)))
      .limit(1)
  );

  if (existing[0]) {
    await runQuery('network.unfollow', () =>
      db.delete(follows).where(eq(follows.id, existing[0].id))
    );
    return res.json({ following: false });
  }

  await runQuery('network.follow', () =>
    db.insert(follows).values({ followerId: userId, followingId: targetUserId })
  );
  res.json({ following: true });
});

router.post('/block/:targetUserId', requireAuth, async (req: AuthRequest, res) => {
  const targetUserId = Number(req.params.targetUserId);
  const userId = req.dbUser!.id;
  if (!Number.isInteger(targetUserId) || targetUserId <= 0 || targetUserId === userId) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }

  await runQuery('network.block', () =>
    db
      .insert(blocks)
      .values({
        blockerId: userId,
        blockedId: targetUserId,
        reason: typeof req.body?.reason === 'string' ? req.body.reason.slice(0, 200) : null,
      })
      .onConflictDoNothing()
  );

  // Clean up connections & follows between blocked users
  await db
    .delete(connections)
    .where(
      or(
        and(eq(connections.requesterId, userId), eq(connections.recipientId, targetUserId)),
        and(eq(connections.requesterId, targetUserId), eq(connections.recipientId, userId))
      )
    );
  await db
    .delete(follows)
    .where(
      or(
        and(eq(follows.followerId, userId), eq(follows.followingId, targetUserId)),
        and(eq(follows.followerId, targetUserId), eq(follows.followingId, userId))
      )
    );

  res.json({ blocked: true });
});

router.delete('/block/:targetUserId', requireAuth, async (req: AuthRequest, res) => {
  const targetUserId = Number(req.params.targetUserId);
  const userId = req.dbUser!.id;
  await runQuery('network.unblock', () =>
    db
      .delete(blocks)
      .where(and(eq(blocks.blockerId, userId), eq(blocks.blockedId, targetUserId)))
  );
  res.json({ unblocked: true });
});

export default router;
