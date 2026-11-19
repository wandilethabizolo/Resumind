import { Router } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { and, desc, eq, inArray, or } from 'drizzle-orm';
import { z } from 'zod';
import { db, runQuery } from '../../db/index.ts';
import {
  blocks,
  commentReactions,
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
  requireAuth,
} from '../middleware/auth.ts';
import { createNotification } from '../services/notifications.ts';
import { emitToAll } from '../socket.ts';

const router = Router();

const MAX_VIDEO_DURATION_SECONDS = 180;
const MAX_VIDEO_BYTES = 65 * 1024 * 1024;
const VIDEO_UPLOAD_DIR = path.resolve(process.cwd(), 'uploads', 'videos');
fs.mkdirSync(VIDEO_UPLOAD_DIR, { recursive: true });

const VIDEO_EXT_MIME: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.ogg': 'video/ogg',
  '.ogv': 'video/ogg',
};

const ALLOWED_VIDEO_MIMES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-m4v',
  'video/ogg',
  'application/ogg',
]);

const videoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(VIDEO_UPLOAD_DIR, { recursive: true });
    cb(null, VIDEO_UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const safeExt = ext in VIDEO_EXT_MIME ? ext : '.mp4';
    cb(null, `${crypto.randomUUID()}${safeExt}`);
  },
});

const uploadVideo = multer({
  storage: videoStorage,
  limits: { fileSize: MAX_VIDEO_BYTES },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const mime = (file.mimetype || '').toLowerCase();
    if (ALLOWED_VIDEO_MIMES.has(mime) || ext in VIDEO_EXT_MIME) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported video format. Upload MP4, WebM, MOV, or OGG video.'));
    }
  },
});

function parseMvhdDuration(buf: Buffer): number | null {
  const idx = buf.indexOf('mvhd');
  if (idx < 4 || idx + 28 >= buf.length) return null;
  const version = buf[idx + 4];
  if (version === 0 && idx + 24 <= buf.length) {
    const timescale = buf.readUInt32BE(idx + 16);
    const duration = buf.readUInt32BE(idx + 20);
    if (timescale > 0 && duration > 0) return duration / timescale;
  } else if (version === 1 && idx + 36 <= buf.length) {
    const timescale = buf.readUInt32BE(idx + 24);
    const durHi = buf.readUInt32BE(idx + 28);
    const durLo = buf.readUInt32BE(idx + 32);
    const duration = durHi * 2 ** 32 + durLo;
    if (timescale > 0 && duration > 0) return duration / timescale;
  }
  return null;
}

function inspectMp4DurationSeconds(filePath: string): number | null {
  try {
    const stat = fs.statSync(filePath);
    const chunkSize = Math.min(512 * 1024, stat.size);
    const fd = fs.openSync(filePath, 'r');
    try {
      const head = Buffer.alloc(chunkSize);
      fs.readSync(fd, head, 0, chunkSize, 0);
      const fromHead = parseMvhdDuration(head);
      if (fromHead !== null) return fromHead;

      if (stat.size > chunkSize) {
        const tailStart = Math.max(0, stat.size - chunkSize);
        const tail = Buffer.alloc(stat.size - tailStart);
        fs.readSync(fd, tail, 0, tail.length, tailStart);
        return parseMvhdDuration(tail);
      }
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    // ignore inspection failure for non-ISO BMFF formats (e.g. WebM)
  }
  return null;
}

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

const isValidVideoValue = (val: string) => {
  if (!val) return true;
  if (/^\/api\/feed\/media\/video\/[a-f0-9-]+\.(mp4|webm|mov|m4v|ogv|ogg)$/i.test(val)) {
    return true;
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

const videoFieldSchema = z
  .string()
  .refine(isValidVideoValue, { message: 'Invalid video reference' })
  .optional()
  .nullable();

router.get('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const viewerId = req.dbUser?.id;
    const topicFilter = typeof req.query.topic === 'string' ? req.query.topic.trim() : '';
    const savedOnly = req.query.saved === 'true';
    const scope = req.query.scope === 'connections' ? 'connections' : 'all';
    const rawLimit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 20;
    const limit = Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 50) : 20;
    const rawOffset = typeof req.query.offset === 'string' ? Number(req.query.offset) : 0;
    const offset = Number.isInteger(rawOffset) && rawOffset >= 0 ? rawOffset : 0;
    const rawAuthorId = typeof req.query.authorId === 'string' ? Number(req.query.authorId) : null;
    const authorFilter =
      rawAuthorId && Number.isInteger(rawAuthorId) && rawAuthorId > 0 ? rawAuthorId : null;
    const rawPostId = typeof req.query.postId === 'string' ? Number(req.query.postId) : null;
    const postFilter =
      rawPostId && Number.isInteger(rawPostId) && rawPostId > 0 ? rawPostId : null;

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

    const baseWhere = postFilter
      ? and(eq(posts.id, postFilter), eq(posts.moderationStatus, 'approved'), eq(users.status, 'active'))
      : and(eq(posts.moderationStatus, 'approved'), eq(users.status, 'active'));

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
        .where(baseWhere)
        .orderBy(desc(posts.createdAt))
        .limit(postFilter ? 1 : 150)
    );

    const visiblePosts = postRows.filter((row) => {
      if (blockedSet.has(row.post.authorId)) return false;
      if (postFilter && row.post.id !== postFilter) return false;
      if (authorFilter && row.post.authorId !== authorFilter) return false;
      if (row.post.visibility === 'connections' || scope === 'connections') {
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
    const reactionBreakdownMap = new Map<number, Record<string, number>>();
    const userReactionMap = new Map<number, string>();
    for (const r of reactionsRows) {
      reactionCountMap.set(r.postId, (reactionCountMap.get(r.postId) ?? 0) + 1);
      const breakdown = reactionBreakdownMap.get(r.postId) ?? {};
      breakdown[r.type] = (breakdown[r.type] ?? 0) + 1;
      reactionBreakdownMap.set(r.postId, breakdown);
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

    const allMatching = visiblePosts.filter((row) =>
      !savedOnly ? true : savedSet.has(row.post.id)
    );
    const pagedMatching = allMatching.slice(offset, offset + limit);
    const hasMore = allMatching.length > offset + limit;

    const formatted = pagedMatching.map((row) => ({
      ...row.post,
      authorName: row.author.fullName,
      authorHeadline: row.profile.headline,
      authorAvatar: row.profile.avatarUrl,
      authorLocation: `${row.profile.location}, ${row.profile.country}`,
      organization: row.organization?.id ? row.organization : null,
      reactionCount: reactionCountMap.get(row.post.id) ?? 0,
      reactionBreakdown: reactionBreakdownMap.get(row.post.id) ?? {},
      commentCount: commentCountMap.get(row.post.id) ?? 0,
      userReaction: userReactionMap.get(row.post.id) ?? null,
      isSaved: savedSet.has(row.post.id),
    }));

    res.json({
      posts: formatted,
      hasMore,
      totalMatching: allMatching.length,
      trendingTopics,
      suggestedOrganizations: suggestedOrgs,
    });
  } catch (err) {
    console.error('Feed load error:', err);
    res.status(500).json({ error: 'Failed to load professional feed' });
  }
});

router.post('/media/video', requireAuth, (req: AuthRequest, res) => {
  uploadVideo.single('video')(req, res, (err: unknown) => {
    if (err) {
      const msg =
        err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE'
          ? 'Video file exceeds the 65 MB upload limit.'
          : err instanceof Error
            ? err.message
            : 'Unable to upload video.';
      return res.status(400).json({ error: msg });
    }
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'No video file attached.' });
    }

    const clientDuration = Number(req.body?.durationSeconds);
    const detectedDuration = inspectMp4DurationSeconds(file.path);
    const effectiveDuration = detectedDuration ?? clientDuration;

    if (
      !Number.isFinite(clientDuration) ||
      clientDuration <= 0 ||
      clientDuration > MAX_VIDEO_DURATION_SECONDS ||
      (detectedDuration !== null && detectedDuration > MAX_VIDEO_DURATION_SECONDS + 0.5)
    ) {
      fs.unlink(file.path, () => {});
      return res.status(400).json({
        error: 'Videos cannot exceed 3 minutes (180 seconds).',
      });
    }

    return res.status(201).json({
      videoUrl: `/api/feed/media/video/${file.filename}`,
      durationSeconds: Math.min(MAX_VIDEO_DURATION_SECONDS, Math.max(1, Math.round(effectiveDuration))),
    });
  });
});

router.get('/media/video/:filename', requireAuth, (req: AuthRequest, res) => {
  const filename = String(req.params.filename || '');
  if (!/^[a-f0-9-]+\.(mp4|webm|mov|m4v|ogv|ogg)$/i.test(filename)) {
    return res.status(400).json({ error: 'Invalid video filename' });
  }
  const filePath = path.resolve(VIDEO_UPLOAD_DIR, filename);
  if (!filePath.startsWith(VIDEO_UPLOAD_DIR + path.sep) || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Video not found' });
  }

  const stat = fs.statSync(filePath);
  const ext = path.extname(filename).toLowerCase();
  const contentType = VIDEO_EXT_MIME[ext] || 'video/mp4';
  const range = req.headers.range;

  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);

  if (range) {
    const match = /^bytes=(\d+)-(\d*)$/.exec(range);
    if (!match) {
      return res.status(416).end();
    }
    const start = Number(match[1]);
    const end = match[2] ? Math.min(Number(match[2]), stat.size - 1) : stat.size - 1;
    if (start >= stat.size || start > end) {
      return res.status(416).end();
    }
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
    res.setHeader('Content-Length', end - start + 1);
    return fs.createReadStream(filePath, { start, end }).pipe(res);
  }

  res.setHeader('Content-Length', stat.size);
  return fs.createReadStream(filePath).pipe(res);
});

router.post('/', requireAuth, async (req: AuthRequest, res) => {
  const schema = z.object({
    content: z.string().min(1).max(3000),
    topic: z.string().min(1).max(60).default('General'),
    postType: z.enum(['update', 'achievement', 'article', 'repost']).default('update'),
    visibility: z.enum(['public', 'connections']).default('public'),
    imageUrl: imageFieldSchema,
    videoUrl: videoFieldSchema,
    videoDurationSeconds: z.number().int().min(1).max(MAX_VIDEO_DURATION_SECONDS).optional().nullable(),
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
        videoUrl: parsed.data.videoUrl || null,
        videoDurationSeconds: parsed.data.videoUrl ? parsed.data.videoDurationSeconds ?? null : null,
        organizationId: parsed.data.organizationId ?? null,
        repostOfId: parsed.data.repostOfId ?? null,
      })
      .returning()
  );

  if (inserted[0] && inserted[0].visibility === 'public') {
    emitToAll('post:new', {
      postId: inserted[0].id,
      authorId: userId,
      createdAt: inserted[0].createdAt,
    });
  }

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
    videoUrl: videoFieldSchema,
    videoDurationSeconds: z.number().int().min(1).max(MAX_VIDEO_DURATION_SECONDS).optional().nullable(),
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

  const nextVideoUrl =
    parsed.data.videoUrl !== undefined ? parsed.data.videoUrl || null : existing[0].videoUrl;
  const nextVideoDuration = nextVideoUrl
    ? parsed.data.videoDurationSeconds !== undefined
      ? parsed.data.videoDurationSeconds
      : existing[0].videoDurationSeconds
    : null;

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
        videoUrl: nextVideoUrl,
        videoDurationSeconds: nextVideoDuration,
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

  if (existing[0].videoUrl?.startsWith('/api/feed/media/video/')) {
    const stillReferenced = await runQuery('feed.checkVideoRef', () =>
      db.select({ id: posts.id }).from(posts).where(eq(posts.videoUrl, existing[0].videoUrl!)).limit(1)
    );
    if (!stillReferenced[0]) {
      const filename = path.basename(existing[0].videoUrl);
      const filePath = path.resolve(VIDEO_UPLOAD_DIR, filename);
      if (filePath.startsWith(VIDEO_UPLOAD_DIR + path.sep)) {
        fs.unlink(filePath, () => {});
      }
    }
  }

  res.json({ deleted: true });
});

const REACTION_TYPES = [
  'like',
  'love',
  'celebrate',
  'support',
  'insightful',
  'funny',
  'dislike',
  'hate',
] as const;

router.post('/:id/react', requireAuth, async (req: AuthRequest, res) => {
  const postId = Number(req.params.id);
  const type = z.enum(REACTION_TYPES).catch('like').parse(req.body?.type);
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

  let reacted = false;
  let activeType: string | null = null;

  if (existing[0]) {
    if (existing[0].type === type) {
      await runQuery('feed.removeReaction', () =>
        db.delete(postReactions).where(eq(postReactions.id, existing[0].id))
      );
      reacted = false;
      activeType = null;
    } else {
      await runQuery('feed.changeReaction', () =>
        db
          .update(postReactions)
          .set({ type })
          .where(eq(postReactions.id, existing[0].id))
      );
      reacted = true;
      activeType = type;
    }
  } else {
    await runQuery('feed.addReaction', () =>
      db.insert(postReactions).values({ postId, userId, type })
    );
    reacted = true;
    activeType = type;

    await createNotification({
      userId: postRows[0].authorId,
      actorId: userId,
      type: 'post_reaction',
      title: `${req.dbUser!.fullName} reacted (${type}) to your update`,
      linkTab: 'home',
      entityId: postId,
    });
  }

  const postReacts = await runQuery('feed.countPostReactions', () =>
    db.select().from(postReactions).where(eq(postReactions.postId, postId))
  );
  const breakdown: Record<string, number> = {};
  for (const r of postReacts) {
    breakdown[r.type] = (breakdown[r.type] ?? 0) + 1;
  }

  res.json({
    reacted,
    type: activeType,
    reactionCount: postReacts.length,
    reactionBreakdown: breakdown,
  });
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

router.get('/:id/comments', requireAuth, async (req: AuthRequest, res) => {
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

  const commentIds = rows.map((r) => r.comment.id);
  const cReactionRows = commentIds.length
    ? await runQuery('feed.getCommentReactions', () =>
        db
          .select()
          .from(commentReactions)
          .where(inArray(commentReactions.commentId, commentIds))
      )
    : [];

  const likeCountMap = new Map<number, number>();
  const likedByMeSet = new Set<number>();
  const viewerId = req.dbUser!.id;
  for (const cr of cReactionRows) {
    likeCountMap.set(cr.commentId, (likeCountMap.get(cr.commentId) ?? 0) + 1);
    if (cr.userId === viewerId) {
      likedByMeSet.add(cr.commentId);
    }
  }

  res.json({
    comments: rows.map((r) => ({
      ...r.comment,
      authorName: r.authorName,
      authorHeadline: r.authorHeadline,
      authorAvatar: r.authorAvatar,
      likesCount: likeCountMap.get(r.comment.id) ?? 0,
      likedByMe: likedByMeSet.has(r.comment.id),
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

router.post('/comments/:commentId/like', requireAuth, async (req: AuthRequest, res) => {
  const commentId = Number(req.params.commentId);
  if (!Number.isInteger(commentId) || commentId <= 0) {
    return res.status(400).json({ error: 'Invalid comment ID' });
  }

  const commentRows = await runQuery('feed.findCommentLike', () =>
    db.select().from(comments).where(eq(comments.id, commentId)).limit(1)
  );
  if (!commentRows[0]) {
    return res.status(404).json({ error: 'Comment not found' });
  }

  const userId = req.dbUser!.id;
  const existing = await runQuery('feed.checkCommentLike', () =>
    db
      .select()
      .from(commentReactions)
      .where(and(eq(commentReactions.commentId, commentId), eq(commentReactions.userId, userId)))
      .limit(1)
  );

  let liked = false;
  if (existing[0]) {
    await runQuery('feed.unlikeComment', () =>
      db.delete(commentReactions).where(eq(commentReactions.id, existing[0].id))
    );
    liked = false;
  } else {
    await runQuery('feed.likeComment', () =>
      db.insert(commentReactions).values({ commentId, userId })
    );
    liked = true;
    await createNotification({
      userId: commentRows[0].authorId,
      actorId: userId,
      type: 'comment_like',
      title: `${req.dbUser!.fullName} liked your comment`,
      body: commentRows[0].content.slice(0, 100),
      linkTab: 'home',
      entityId: commentRows[0].postId,
    });
  }

  const allForComment = await runQuery('feed.countCommentLikes', () =>
    db
      .select({ id: commentReactions.id })
      .from(commentReactions)
      .where(eq(commentReactions.commentId, commentId))
  );

  res.json({ liked, likesCount: allForComment.length });
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
