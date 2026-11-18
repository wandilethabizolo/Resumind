import { Router } from 'express';
import { and, desc, eq, inArray, ne, or } from 'drizzle-orm';
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
    const [convRows, allMembers, latestMessages] = await Promise.all([
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
    ]);

    const myMembershipMap = new Map(myMemberships.map((m) => [m.conversationId, m]));
    const peerMap = new Map(allMembers.map((m) => [m.member.conversationId, m]));

    const result = convRows.map((c) => {
      const myMem = myMembershipMap.get(c.id)!;
      const peer = peerMap.get(c.id);
      const convMsgs = latestMessages.filter((m) => m.conversationId === c.id);
      const lastMsg = convMsgs[0] ?? null;
      const unreadCount = convMsgs.filter(
        (m) => m.senderId !== userId && m.createdAt > myMem.lastReadAt
      ).length;

      return {
        id: c.id,
        isRequest: !myMem.accepted,
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

    res.json({ conversations: result });
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
      return res.json({ conversationId: shared[0].conversationId });
    }
  }

  // Check if users are connected; if not, treat as message request for recipient
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
  const isRequest = !conn[0];

  const [conv] = await runQuery('msg.createConv', () =>
    db.insert(conversations).values({ isRequest }).returning()
  );

  await runQuery('msg.addMembers', () =>
    db.insert(conversationMembers).values([
      { conversationId: conv.id, userId, accepted: true },
      { conversationId: conv.id, userId: recipientId, accepted: !isRequest },
    ])
  );

  res.status(201).json({ conversationId: conv.id, isRequest });
});

router.get('/:id/messages', requireAuth, async (req: AuthRequest, res) => {
  const conversationId = Number(req.params.id);
  const userId = req.dbUser!.id;
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

  const rows = await runQuery('msg.listMessages', () =>
    db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(messages.createdAt)
      .limit(200)
  );

  await runQuery('msg.markReadOnFetch', () =>
    db
      .update(conversationMembers)
      .set({ lastReadAt: new Date() })
      .where(eq(conversationMembers.id, membership[0].id))
  );

  res.json({ messages: rows });
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
  if (peer) {
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
  }

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

  await runQuery('msg.touchConv', () =>
    db
      .update(conversations)
      .set({ updatedAt: new Date() })
      .where(eq(conversations.id, conversationId))
  );

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
  await runQuery('msg.acceptRequest', () =>
    db
      .update(conversationMembers)
      .set({ accepted: true })
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
  await runQuery('msg.markRead', () =>
    db
      .update(conversationMembers)
      .set({ lastReadAt: new Date() })
      .where(
        and(
          eq(conversationMembers.conversationId, conversationId),
          eq(conversationMembers.userId, userId)
        )
      )
  );
  res.json({ read: true });
});

export default router;
