import { Router } from 'express';
import { and, desc, eq, inArray, lt, ne, or } from 'drizzle-orm';
import { z } from 'zod';
import { db, runQuery } from '../../db/index.ts';
import {
  blocks,
  connections,
  conversationMembers,
  conversations,
  messages,
  profiles,
  users,
} from '../../db/schema.ts';
import { AuthRequest, requireAuth } from '../middleware/auth.ts';
import { createNotification } from '../services/notifications.ts';
import { emitToConversation, emitToUser } from '../socket.ts';

const router = Router();

router.get('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.dbUser!.id;
    const myMemberships = await runQuery('msg.myConvs', () =>
      db
        .select()
        .from(conversationMembers)
        .where(eq(conversationMembers.userId, userId))
    );
    if (!myMemberships.length) {
      return res.json({ conversations: [] });
    }

    const convIds = myMemberships.map((m) => m.conversationId);
    const [convRows, allMembers, latestMessages, myBlocks] = await Promise.all([
      runQuery('msg.convRows', () =>
        db
          .select()
          .from(conversations)
          .where(inArray(conversations.id, convIds))
          .orderBy(desc(conversations.updatedAt))
      ),
      runQuery('msg.allMembers', () =>
        db
          .select({
            member: conversationMembers,
            fullName: users.fullName,
            headline: profiles.headline,
            avatarUrl: profiles.avatarUrl,
          })
          .from(conversationMembers)
          .innerJoin(users, eq(conversationMembers.userId, users.id))
          .innerJoin(profiles, eq(profiles.userId, users.id))
          .where(
            and(
              inArray(conversationMembers.conversationId, convIds),
              ne(conversationMembers.userId, userId)
            )
          )
      ),
      runQuery('msg.recentMessages', () =>
        db
          .select()
          .from(messages)
          .where(inArray(messages.conversationId, convIds))
          .orderBy(desc(messages.createdAt))
      ),
      runQuery('msg.blocksFilter', () =>
        db
          .select()
          .from(blocks)
          .where(or(eq(blocks.blockerId, userId), eq(blocks.blockedId, userId)))
      ),
    ]);

    const acceptedConns = await runQuery('msg.acceptedConns', () =>
      db
        .select()
        .from(connections)
        .where(
          and(
            eq(connections.status, 'accepted'),
            or(eq(connections.requesterId, userId), eq(connections.recipientId, userId))
          )
        )
    );
    const connectedPeerIds = new Set(
      acceptedConns.map((c) => (c.requesterId === userId ? c.recipientId : c.requesterId))
    );

    const blockedPeerIds = new Set(
      myBlocks.map((b) => (b.blockerId === userId ? b.blockedId : b.blockerId))
    );
    const myMembershipMap = new Map(myMemberships.map((m) => [m.conversationId, m]));
    const peerMap = new Map(allMembers.map((m) => [m.member.conversationId, m]));

    let totalUnreadMessages = 0;
    const result = convRows
      .filter((c) => {
        const peer = peerMap.get(c.id);
        return !peer || !blockedPeerIds.has(peer.member.userId);
      })
      .map((c) => {
        const myMem = myMembershipMap.get(c.id)!;
        const peer = peerMap.get(c.id);
        const convMsgs = latestMessages.filter((m) => m.conversationId === c.id);
        const lastMsg = convMsgs[0] ?? null;
        const unreadCount = convMsgs.filter(
          (m) => m.senderId !== userId && m.createdAt > myMem.lastReadAt
        ).length;
        totalUnreadMessages += unreadCount;

        return {
          id: c.id,
          isRequest: !myMem.accepted,
          peerAccepted: peer ? peer.member.accepted : true,
          isConnected: peer ? connectedPeerIds.has(peer.member.userId) : false,
          unreadCount,
          updatedAt: c.updatedAt,
          peer: peer
            ? {
                userId: peer.member.userId,
                fullName: peer.fullName,
                headline: peer.headline,
                avatarUrl: peer.avatarUrl,
                lastReadAt: peer.member.lastReadAt,
              }
            : null,
          lastMessage: lastMsg,
        };
      });

    res.json({ conversations: result, totalUnreadMessages });
  } catch {
    res.status(500).json({ error: 'Failed to load conversations' });
  }
});

router.post('/', requireAuth, async (req: AuthRequest, res) => {
  const parsed = z.object({ recipientId: z.number().int().positive() }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid recipientId' });
  }
  const userId = req.dbUser!.id;
  const recipientId = parsed.data.recipientId;
  if (recipientId === userId) {
    return res.status(400).json({ error: 'Cannot start conversation with yourself' });
  }

  const blocked = await runQuery('msg.checkBlock', () =>
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
    return res.status(403).json({ error: 'Messaging is unavailable with this user' });
  }

  // Require an accepted connection before starting or messaging in a 1:1 chat
  const conn = await runQuery('msg.checkConn', () =>
    db
      .select()
      .from(connections)
      .where(
        and(
          eq(connections.status, 'accepted'),
          or(
            and(eq(connections.requesterId, userId), eq(connections.recipientId, recipientId)),
            and(eq(connections.requesterId, recipientId), eq(connections.recipientId, userId))
          )
        )
      )
      .limit(1)
  );
  if (!conn[0]) {
    return res.status(403).json({
      error: 'You can only message users you are connected with. Send a connection invitation first.',
    });
  }

  // Check if 1:1 conversation already exists
  const myConvs = await runQuery('msg.findExisting1', () =>
    db
      .select({ conversationId: conversationMembers.conversationId })
      .from(conversationMembers)
      .where(eq(conversationMembers.userId, userId))
  );
  if (myConvs.length) {
    const shared = await runQuery('msg.findExisting2', () =>
      db
        .select()
        .from(conversationMembers)
        .where(
          and(
            inArray(
              conversationMembers.conversationId,
              myConvs.map((c) => c.conversationId)
            ),
            eq(conversationMembers.userId, recipientId)
          )
        )
        .limit(1)
    );
    if (shared[0]) {
      return res.json({ conversationId: shared[0].conversationId, isRequest: false });
    }
  }

  const [conv] = await runQuery('msg.createConv', () =>
    db.insert(conversations).values({ isRequest: false }).returning()
  );

  await runQuery('msg.addMembers', () =>
    db.insert(conversationMembers).values([
      { conversationId: conv.id, userId, accepted: true },
      { conversationId: conv.id, userId: recipientId, accepted: true },
    ])
  );

  res.status(201).json({ conversationId: conv.id, isRequest: false });
});

router.get('/:id/messages', requireAuth, async (req: AuthRequest, res) => {
  const conversationId = Number(req.params.id);
  const userId = req.dbUser!.id;
  const beforeId = req.query.before ? Number(req.query.before) : null;
  const limit = Math.min(100, Math.max(10, Number(req.query.limit) || 50));

  if (!Number.isInteger(conversationId) || conversationId <= 0) {
    return res.status(400).json({ error: 'Invalid conversation ID' });
  }

  const membership = await runQuery('msg.verifyReadMember', () =>
    db
      .select()
      .from(conversationMembers)
      .where(
        and(
          eq(conversationMembers.conversationId, conversationId),
          eq(conversationMembers.userId, userId)
        )
      )
      .limit(1)
  );
  if (!membership[0]) {
    return res.status(403).json({ error: 'Not authorized to access this conversation' });
  }

  const descRows = await runQuery('msg.listMessages', () =>
    db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, conversationId),
          beforeId && Number.isInteger(beforeId) && beforeId > 0
            ? lt(messages.id, beforeId)
            : undefined
        )
      )
      .orderBy(desc(messages.id))
      .limit(limit + 1)
  );

  const hasMore = descRows.length > limit;
  const chronological = descRows.slice(0, limit).reverse();

  const readAt = new Date();
  if (!beforeId) {
    await runQuery('msg.markReadOnFetch', () =>
      db
        .update(conversationMembers)
        .set({ lastReadAt: readAt })
        .where(eq(conversationMembers.id, membership[0].id))
    );
    emitToConversation(conversationId, 'conversation:read', {
      conversationId,
      userId,
      readAt: readAt.toISOString(),
    });
  }

  res.json({ messages: chronological, hasMore });
});

router.post('/:id/messages', requireAuth, async (req: AuthRequest, res) => {
  const conversationId = Number(req.params.id);
  const parsed = z.object({ content: z.string().min(1).max(3000) }).safeParse(req.body);
  if (!Number.isInteger(conversationId) || conversationId <= 0 || !parsed.success) {
    return res.status(400).json({ error: 'Invalid message payload' });
  }

  const userId = req.dbUser!.id;
  const members = await runQuery('msg.verifySendMembers', () =>
    db
      .select()
      .from(conversationMembers)
      .where(eq(conversationMembers.conversationId, conversationId))
  );
  const me = members.find((m) => m.userId === userId);
  if (!me) {
    return res.status(403).json({ error: 'Not authorized to send messages in this conversation' });
  }

  const peer = members.find((m) => m.userId !== userId);
  if (!peer) {
    return res.status(403).json({
      error: 'The other participant is no longer in this conversation.',
    });
  }

  const blocked = await runQuery('msg.checkSendBlock', () =>
    db
      .select()
      .from(blocks)
      .where(
        or(
          and(eq(blocks.blockerId, userId), eq(blocks.blockedId, peer.userId)),
          and(eq(blocks.blockerId, peer.userId), eq(blocks.blockedId, userId))
        )
      )
      .limit(1)
  );
  if (blocked[0]) {
    return res.status(403).json({ error: 'Cannot message a blocked user' });
  }

  const activeConn = await runQuery('msg.verifySendConn', () =>
    db
      .select()
      .from(connections)
      .where(
        and(
          eq(connections.status, 'accepted'),
          or(
            and(eq(connections.requesterId, userId), eq(connections.recipientId, peer.userId)),
            and(eq(connections.requesterId, peer.userId), eq(connections.recipientId, userId))
          )
        )
      )
      .limit(1)
  );
  if (!activeConn[0]) {
    return res.status(403).json({
      error: 'You can only message users you are connected with.',
    });
  }

  const now = new Date();
  const [msg] = await runQuery('msg.insertMessage', () =>
    db
      .insert(messages)
      .values({
        conversationId,
        senderId: userId,
        content: parsed.data.content.trim(),
      })
      .returning()
  );

  await Promise.all([
    runQuery('msg.touchConv', () =>
      db
        .update(conversations)
        .set({ updatedAt: now })
        .where(eq(conversations.id, conversationId))
    ),
    runQuery('msg.markSenderRead', () =>
      db
        .update(conversationMembers)
        .set({ lastReadAt: now })
        .where(eq(conversationMembers.id, me.id))
    ),
  ]);

  emitToConversation(conversationId, 'message:new', msg);
  if (peer) {
    emitToUser(peer.userId, 'message:new', msg);
    await createNotification({
      userId: peer.userId,
      actorId: userId,
      type: 'message',
      title: `New message from ${req.dbUser!.fullName}`,
      body: parsed.data.content.trim().slice(0, 100),
      linkTab: 'messages',
      entityId: conversationId,
    });
  }

  res.status(201).json({ message: msg });
});

router.post('/:id/accept', requireAuth, async (req: AuthRequest, res) => {
  const conversationId = Number(req.params.id);
  const userId = req.dbUser!.id;
  if (!Number.isInteger(conversationId) || conversationId <= 0) {
    return res.status(400).json({ error: 'Invalid conversation ID' });
  }
  await runQuery('msg.acceptRequest', () =>
    db
      .update(conversationMembers)
      .set({ accepted: true, lastReadAt: new Date() })
      .where(
        and(
          eq(conversationMembers.conversationId, conversationId),
          eq(conversationMembers.userId, userId)
        )
      )
  );
  res.json({ accepted: true });
});

router.post('/:id/read', requireAuth, async (req: AuthRequest, res) => {
  const conversationId = Number(req.params.id);
  const userId = req.dbUser!.id;
  if (!Number.isInteger(conversationId) || conversationId <= 0) {
    return res.status(400).json({ error: 'Invalid conversation ID' });
  }
  const readAt = new Date();
  await runQuery('msg.markRead', () =>
    db
      .update(conversationMembers)
      .set({ lastReadAt: readAt })
      .where(
        and(
          eq(conversationMembers.conversationId, conversationId),
          eq(conversationMembers.userId, userId)
        )
      )
  );
  emitToConversation(conversationId, 'conversation:read', {
    conversationId,
    userId,
    readAt: readAt.toISOString(),
  });
  res.json({ read: true, readAt: readAt.toISOString() });
});

router.delete('/:id/messages/:messageId', requireAuth, async (req: AuthRequest, res) => {
  const conversationId = Number(req.params.id);
  const messageId = Number(req.params.messageId);
  const userId = req.dbUser!.id;
  if (
    !Number.isInteger(conversationId) ||
    conversationId <= 0 ||
    !Number.isInteger(messageId) ||
    messageId <= 0
  ) {
    return res.status(400).json({ error: 'Invalid conversation or message ID' });
  }

  const members = await runQuery('msg.verifyDelMsgMembers', () =>
    db
      .select()
      .from(conversationMembers)
      .where(eq(conversationMembers.conversationId, conversationId))
  );
  if (!members.some((m) => m.userId === userId)) {
    return res.status(403).json({ error: 'Not authorized to access this conversation' });
  }

  const msgRows = await runQuery('msg.findMsgDel', () =>
    db
      .select()
      .from(messages)
      .where(and(eq(messages.id, messageId), eq(messages.conversationId, conversationId)))
      .limit(1)
  );
  if (!msgRows[0]) {
    return res.status(404).json({ error: 'Message not found' });
  }
  if (msgRows[0].senderId !== userId) {
    return res.status(403).json({ error: 'You can only delete your own messages' });
  }

  await runQuery('msg.deleteMsg', () => db.delete(messages).where(eq(messages.id, messageId)));

  emitToConversation(conversationId, 'message:deleted', { conversationId, messageId });
  for (const m of members) {
    if (m.userId !== userId) {
      emitToUser(m.userId, 'message:deleted', { conversationId, messageId });
    }
  }

  res.json({ deleted: true, messageId });
});

router.delete('/:id', requireAuth, async (req: AuthRequest, res) => {
  const conversationId = Number(req.params.id);
  const userId = req.dbUser!.id;
  if (!Number.isInteger(conversationId) || conversationId <= 0) {
    return res.status(400).json({ error: 'Invalid conversation ID' });
  }

  const deleted = await runQuery('msg.leaveOrDismiss', () =>
    db
      .delete(conversationMembers)
      .where(
        and(
          eq(conversationMembers.conversationId, conversationId),
          eq(conversationMembers.userId, userId)
        )
      )
      .returning()
  );
  if (!deleted[0]) {
    return res.status(404).json({ error: 'Conversation not found' });
  }

  const remaining = await runQuery('msg.remainingMembers', () =>
    db
      .select({ id: conversationMembers.id })
      .from(conversationMembers)
      .where(eq(conversationMembers.conversationId, conversationId))
      .limit(1)
  );
  if (remaining.length === 0) {
    await runQuery('msg.cleanupEmptyConv', () =>
      db.delete(conversations).where(eq(conversations.id, conversationId))
    );
  }

  res.json({ deleted: true, dismissed: true });
});

export default router;
