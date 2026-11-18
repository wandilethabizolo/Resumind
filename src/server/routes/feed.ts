import { Router } from 'express';
import { and, desc, eq, inArray, or } from 'drizzle-orm';
import { z } from 'zod';
import { db, runQuery } from '../../db/index.ts';
import {
  blocks,
  comments,
  connections,
  organizations,
  postReactions,
  posts,
  profiles,
  savedPosts,
  users,
} from '../../db/schema.ts';
import {
  AuthRequest,
  getUserOrgMembership,
  optionalAuth,
  requireAuth,
} from '../middleware/auth.ts';
import { createNotification } from '../services/notifications.ts';

const router = Router();

const isValidImageValue = (val: string) => {
  if (!val) return true;
  if (/^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(val)) {
    return val.length <= 1_600_000;
  }
  if (/^https?:\/\/\S+$/i.test(val)) {
    return val.length <= 600;
  }
  return false;
};

const imageFieldSchema = z
  .string()
  .refine(isValidImageValue, { message: 'Image must be an https URL or PNG/JPEG/WEBP data image under 1.2MB' })
  .optional()
  .nullable();

router.get('/', optionalAuth, async (req: AuthRequest, res) => {
  try {
    const viewerId = req.dbUser?.id;
    const topicFilter = typeof req.query.topic === 'string' ? req.query.topic.trim() : '';
    const savedOnly = req.query.saved === 'true';
    const rawAuthorId = typeof req.query.authorId === 'string' ? Number(req.query.authorId) : null;
    const authorFilter =
      rawAuthorId && Number.isInteger(rawAuthorId) && rawAuthorId > 0 ? rawAuthorId : null;

    let blockedSet = new Set<number>();
    let connectedSet = new Set<number>();

    if (viewerId) {
      const [bRows, cRows] = await Promise.all([
        runQuery('feed.blocks', () =>
          db
            .select()
            .from(blocks)
            .where(or(eq(blocks.blockerId, viewerId), eq(blocks.blockedId, viewerId)))
        ),
        runQuery('feed.conns', () =>
          db
            .select()
            .from(connections)
            .where(
              and(
                eq(connections.status, 'accepted'),
                or(eq(connections.requesterId, viewerId), eq(connections.recipientId, viewerId))
              )
            )
        ),
      ]);
      blockedSet = new Set(bRows.map((b) => (b.blockerId === viewerId ? b.blockedId : b.blockerId)));
      connectedSet = new Set(
        cRows.map((c) => (c.requesterId === viewerId ? c.recipientId : c.requesterId))
      );
    }

    const postRows = await runQuery('feed.posts', () =>
      db
        .select({
          post: posts,
          author: {
            id: users.id,
            fullName: users.fullName,
            status: users.status,
          },
          profile: {
            headline: profiles.headline,
            avatarUrl: profiles.avatarUrl,
            location: profiles.location,
            country: profiles.country,
            visibility: profiles.visibility,
          },
          organization: {
            id: organizations.id,
            name: organizations.name,
            verified: organizations.verified,
          },
        })
        .from(posts)
        .innerJoin(users, eq(posts.authorId, users.id))
        .innerJoin(profiles, eq(profiles.userId, users.id))
        .leftJoin(organizations, eq(posts.organizationId, organizations.id))
        .where(and(eq(posts.moderationStatus, 'approved'), eq(users.status, 'active')))
        .orderBy(desc(posts.createdAt))
        .limit(60)
    );

    const visiblePosts = postRows.filter((row) => {
      if (blockedSet.has(row.post.authorId)) return false;
      if (authorFilter && row.post.authorId !== authorFilter) return false;
      if (row.post.visibility === 'connections') {
        if (!viewerId) return false;
        if (row.post.authorId !== viewerId && !connectedSet.has(row.post.authorId)) return false;
      }
      if (topicFilter && row.post.topic.toLowerCase() !== topicFilter.toLowerCase()) {
        return false;
      }
      return true;
    });

    const postIds = visiblePosts.map((p) => p.post.id);
    const [reactionsRows, commentsRows, savedRows] = postIds.length
      ? await Promise.all([
          runQuery('feed.reactions', () =>
            db.select().from(postReactions).where(inArray(postReactions.postId, postIds))
          ),
          runQuery('feed.comments', () =>
            db
              .select()
              .from(comments)
              .where(
                and(inArray(comments.postId, postIds), eq(comments.moderationStatus, 'approved'))
              )
          ),
          viewerId
            ? runQuery('feed.saved', () =>
                db
                  .select()
                  .from(savedPosts)
                  .where(and(eq(savedPosts.userId, viewerId), inArray(savedPosts.postId, postIds)))
              )
            : Promise.resolve([]),
        ])
      : [[], [], []];

    const reactionCountMap = new Map<number, number>();
    const userReactionMap = new Map<number, string>();
    for (const r of reactionsRows) {
      reactionCountMap.set(r.postId, (reactionCountMap.get(r.postId) ?? 0) + 1);
      if (viewerId && r.userId === viewerId) {
        userReactionMap.set(r.postId, r.type);
      }
    }

    const commentCountMap = new Map<number, number>();
    for (const c of commentsRows) {
      commentCountMap.set(c.postId, (commentCountMap.get(c.postId) ?? 0) + 1);
    }

    const savedSet = new Set(savedRows.map((s) => s.postId));

    // Compute trending topics from approved posts
    const topicCounts = new Map<string, number>();
    for (const row of postRows) {
      topicCounts.set(row.post.topic, (topicCounts.get(row.post.topic) ?? 0) + 1);
    }
    const trendingTopics = Array.from(topicCounts.entries())
      .map(([topic, count]) => ({ topic, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    const suggestedOrgs = await runQuery('feed.orgs', () =>
      db
        .select({
          id: organizations.id,
          name: organizations.name,
          industry: organizations.industry,
          location: organizations.location,
          country: organizations.country,
          verified: organizations.verified,
        })
        .from(organizations)
        .where(eq(organizations.status, 'active'))
        .limit(4)
    );

    const formatted = visiblePosts
      .filter((row) => (!savedOnly ? true : savedSet.has(row.post.id)))
      .map((row) => ({
        ...row.post,
        authorName: row.author.fullName,
        authorHeadline: row.profile.headline,
        authorAvatar: row.profile.avatarUrl,
        authorLocation: `${row.profile.location}, ${row.profile.country}`,
        organization: row.organization?.id ? row.organization : null,
        reactionCount: reactionCountMap.get(row.post.id) ?? 0,
        commentCount: commentCountMap.get(row.post.id) ?? 0,
        userReaction: userReactionMap.get(row.post.id) ?? null,
        isSaved: savedSet.has(row.post.id),
      }));

    res.json({
      posts: formatted,
      trendingTopics,
      suggestedOrganizations: suggestedOrgs,
    });
  } catch (err) {
    console.error('Feed load error:', err);
    res.status(500).json({ error: 'Failed to load professional feed' });
  }
});

router.post('/', requireAuth, async (req: AuthRequest, res) => {
  const schema = z.object({
    content: z.string().min(1).max(3000),
    topic: z.string().min(1).max(60).default('General'),
    postType: z.enum(['update', 'achievement', 'article', 'repost']).default('update'),
    visibility: z.enum(['public', 'connections']).default('public'),
    imageUrl: imageFieldSchema,
    organizationId: z.number().int().positive().optional().nullable(),
    repostOfId: z.number().int().positive().optional().nullable(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid post payload', details: parsed.error.flatten() });
  }

  const userId = req.dbUser!.id;
  if (parsed.data.organizationId) {
    const member = await getUserOrgMembership(parsed.data.organizationId, userId);
    if (!member || !['owner', 'admin', 'recruiter'].includes(member.role)) {
      return res.status(403).json({ error: 'Not authorized to post on behalf of this organization' });
    }
  }

  const inserted = await runQuery('feed.createPost', () =>
    db
      .insert(posts)
      .values({
        authorId: userId,
        content: parsed.data.content.trim(),
        topic: parsed.data.topic.trim(),
        postType: parsed.data.postType,
        visibility: parsed.data.visibility,
        imageUrl: parsed.data.imageUrl || null,
        organizationId: parsed.data.organizationId ?? null,
        repostOfId: parsed.data.repostOfId ?? null,
      })
      .returning()
  );

  res.status(201).json({ post: inserted[0] });
});

router.patch('/:id', requireAuth, async (req: AuthRequest, res) => {
  const postId = Number(req.params.id);
  const schema = z.object({
    content: z.string().min(1).max(3000),
    topic: z.string().min(1).max(60).optional(),
    postType: z.enum(['update', 'achievement', 'article', 'repost']).optional(),
    visibility: z.enum(['public', 'connections']).optional(),
    imageUrl: imageFieldSchema,
  });
  const parsed = schema.safeParse(req.body);
  if (!Number.isInteger(postId) || postId <= 0 || !parsed.success) {
    return res.status(400).json({ error: 'Invalid post update request' });
  }

  const existing = await runQuery('feed.findPost', () =>
    db.select().from(posts).where(eq(posts.id, postId)).limit(1)
  );
  if (!existing[0]) {
    return res.status(404).json({ error: 'Post not found' });
  }
  if (existing[0].authorId !== req.dbUser!.id) {
    return res.status(403).json({ error: 'You can only edit your own posts' });
  }

  const updated = await runQuery('feed.updatePost', () =>
    db
      .update(posts)
      .set({
        content: parsed.data.content.trim(),
        topic: parsed.data.topic?.trim() ?? existing[0].topic,
        postType: parsed.data.postType ?? existing[0].postType,
        visibility: parsed.data.visibility ?? existing[0].visibility,
        imageUrl:
          parsed.data.imageUrl !== undefined ? parsed.data.imageUrl || null : existing[0].imageUrl,
        updatedAt: new Date(),
      })
      .where(eq(posts.id, postId))
      .returning()
  );

  res.json({ post: updated[0] });
});

router.delete('/:id', requireAuth, async (req: AuthRequest, res) => {
  const postId = Number(req.params.id);
  if (!Number.isInteger(postId) || postId <= 0) {
    return res.status(400).json({ error: 'Invalid post ID' });
  }
  const existing = await runQuery('feed.findPostDel', () =>
    db.select().from(posts).where(eq(posts.id, postId)).limit(1)
  );
  if (!existing[0]) {
    return res.status(404).json({ error: 'Post not found' });
  }
  const isStaff = ['moderator', 'admin', 'superadmin'].includes(req.dbUser!.role);
  if (existing[0].authorId !== req.dbUser!.id && !isStaff) {
    return res.status(403).json({ error: 'Not authorized to delete this post' });
  }

  await runQuery('feed.deletePost', () => db.delete(posts).where(eq(posts.id, postId)));
  res.json({ deleted: true });
});

router.post('/:id/react', requireAuth, async (req: AuthRequest, res) => {
  const postId = Number(req.params.id);
  const type = z.enum(['like', 'celebrate', 'insightful']).catch('like').parse(req.body?.type);
  if (!Number.isInteger(postId) || postId <= 0) {
    return res.status(400).json({ error: 'Invalid post ID' });
  }

  const postRows = await runQuery('feed.findPostReact', () =>
    db.select().from(posts).where(eq(posts.id, postId)).limit(1)
  );
  if (!postRows[0]) {
    return res.status(404).json({ error: 'Post not found' });
  }

  const userId = req.dbUser!.id;
  const existing = await runQuery('feed.checkReaction', () =>
    db
      .select()
      .from(postReactions)
      .where(and(eq(postReactions.postId, postId), eq(postReactions.userId, userId)))
      .limit(1)
  );

  if (existing[0]) {
    if (existing[0].type === type) {
      await runQuery('feed.removeReaction', () =>
        db.delete(postReactions).where(eq(postReactions.id, existing[0].id))
      );
      return res.json({ reacted: false, type: null });
    }
    await runQuery('feed.changeReaction', () =>
      db
        .update(postReactions)
        .set({ type })
        .where(eq(postReactions.id, existing[0].id))
    );
    return res.json({ reacted: true, type });
  }

  await runQuery('feed.addReaction', () =>
    db.insert(postReactions).values({ postId, userId, type })
  );

  await createNotification({
    userId: postRows[0].authorId,
    actorId: userId,
    type: 'post_reaction',
    title: `${req.dbUser!.fullName} reacted to your update`,
    linkTab: 'home',
    entityId: postId,
  });

  res.json({ reacted: true, type });
});

router.post('/:id/save', requireAuth, async (req: AuthRequest, res) => {
  const postId = Number(req.params.id);
  const userId = req.dbUser!.id;
  if (!Number.isInteger(postId) || postId <= 0) {
    return res.status(400).json({ error: 'Invalid post ID' });
  }

  const existing = await runQuery('feed.checkSaved', () =>
    db
      .select()
      .from(savedPosts)
      .where(and(eq(savedPosts.postId, postId), eq(savedPosts.userId, userId)))
      .limit(1)
  );

  if (existing[0]) {
    await runQuery('feed.unsave', () =>
      db.delete(savedPosts).where(eq(savedPosts.id, existing[0].id))
    );
    return res.json({ saved: false });
  }

  await runQuery('feed.save', () =>
    db.insert(savedPosts).values({ postId, userId })
  );
  res.json({ saved: true });
});

router.get('/:id/comments', optionalAuth, async (req: AuthRequest, res) => {
  const postId = Number(req.params.id);
  if (!Number.isInteger(postId) || postId <= 0) {
    return res.status(400).json({ error: 'Invalid post ID' });
  }

  const rows = await runQuery('feed.getComments', () =>
    db
      .select({
        comment: comments,
        authorName: users.fullName,
        authorHeadline: profiles.headline,
        authorAvatar: profiles.avatarUrl,
      })
      .from(comments)
      .innerJoin(users, eq(comments.authorId, users.id))
      .innerJoin(profiles, eq(profiles.userId, users.id))
      .where(and(eq(comments.postId, postId), eq(comments.moderationStatus, 'approved')))
      .orderBy(comments.createdAt)
  );

  res.json({
    comments: rows.map((r) => ({
      ...r.comment,
      authorName: r.authorName,
      authorHeadline: r.authorHeadline,
      authorAvatar: r.authorAvatar,
    })),
  });
});

router.post('/:id/comments', requireAuth, async (req: AuthRequest, res) => {
  const postId = Number(req.params.id);
  const schema = z.object({
    content: z.string().min(1).max(1500),
    parentId: z.number().int().positive().optional().nullable(),
  });
  const parsed = schema.safeParse(req.body);
  if (!Number.isInteger(postId) || postId <= 0 || !parsed.success) {
    return res.status(400).json({ error: 'Invalid comment payload' });
  }

  const postRows = await runQuery('feed.findPostComment', () =>
    db.select().from(posts).where(eq(posts.id, postId)).limit(1)
  );
  if (!postRows[0]) {
    return res.status(404).json({ error: 'Post not found' });
  }

  const inserted = await runQuery('feed.addComment', () =>
    db
      .insert(comments)
      .values({
        postId,
        authorId: req.dbUser!.id,
        parentId: parsed.data.parentId ?? null,
        content: parsed.data.content.trim(),
      })
      .returning()
  );

  await createNotification({
    userId: postRows[0].authorId,
    actorId: req.dbUser!.id,
    type: 'post_comment',
    title: `${req.dbUser!.fullName} commented on your post`,
    body: parsed.data.content.trim().slice(0, 100),
    linkTab: 'home',
    entityId: postId,
  });

  res.status(201).json({ comment: inserted[0] });
});

router.delete('/comments/:commentId', requireAuth, async (req: AuthRequest, res) => {
  const commentId = Number(req.params.commentId);
  if (!Number.isInteger(commentId) || commentId <= 0) {
    return res.status(400).json({ error: 'Invalid comment ID' });
  }
  const rows = await runQuery('feed.findComment', () =>
    db.select().from(comments).where(eq(comments.id, commentId)).limit(1)
  );
  if (!rows[0]) {
    return res.status(404).json({ error: 'Comment not found' });
  }
  const isStaff = ['moderator', 'admin', 'superadmin'].includes(req.dbUser!.role);
  if (rows[0].authorId !== req.dbUser!.id && !isStaff) {
    return res.status(403).json({ error: 'Not authorized to delete this comment' });
  }

  await runQuery('feed.deleteComment', () =>
    db.delete(comments).where(eq(comments.id, commentId))
  );
  res.json({ deleted: true });
});

export default router;
