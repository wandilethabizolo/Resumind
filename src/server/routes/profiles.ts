import { Router } from 'express';
import { and, desc, eq, ilike, ne, or } from 'drizzle-orm';
import { z } from 'zod';
import { db, runQuery } from '../../db/index.ts';
import {
  auditEvents,
  blocks,
  connections,
  follows,
  jobs,
  organizations,
  posts,
  profiles,
  users,
} from '../../db/schema.ts';
import { AuthRequest, optionalAuth, requireAuth } from '../middleware/auth.ts';
import { getClientIp, recordAuditEvent } from '../services/audit.ts';

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

const experienceSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(160),
  company: z.string().min(1).max(160),
  location: z.string().max(120).default(''),
  startDate: z.string().max(40).default(''),
  endDate: z.string().max(40).default(''),
  current: z.boolean().default(false),
  description: z.string().max(2000).default(''),
});

const educationSchema = z.object({
  id: z.string().min(1),
  institution: z.string().min(1).max(180),
  degree: z.string().max(120).default(''),
  field: z.string().max(160).default(''),
  startYear: z.string().max(10).default(''),
  endYear: z.string().max(10).default(''),
  description: z.string().max(1500).default(''),
});

const certificateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(180),
  issuer: z.string().max(160).default(''),
  issueDate: z.string().max(40).default(''),
  credentialUrl: z.string().max(400).optional(),
});

const projectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(160),
  role: z.string().max(120).default(''),
  summary: z.string().max(1500).default(''),
  url: z.string().max(400).optional(),
});

const updateProfileSchema = z.object({
  fullName: z.string().min(2).max(120).optional(),
  headline: z.string().max(220).optional(),
  about: z.string().max(4000).optional(),
  location: z.string().max(120).optional(),
  country: z.string().max(120).optional(),
  currentPosition: z.string().max(180).optional(),
  avatarUrl: z
    .string()
    .refine(isValidImageValue, { message: 'Invalid avatar image format or size' })
    .optional(),
  coverUrl: z
    .string()
    .refine(isValidImageValue, { message: 'Invalid cover image format or size' })
    .optional(),
  website: z.string().max(400).optional(),
  linkedinUrl: z.string().max(400).optional(),
  githubUrl: z.string().max(400).optional(),
  visibility: z.enum(['public', 'connections', 'private']).optional(),
  showEmail: z.boolean().optional(),
  openToWork: z.boolean().optional(),
  experiences: z.array(experienceSchema).max(30).optional(),
  education: z.array(educationSchema).max(20).optional(),
  skills: z.array(z.string().min(1).max(60)).max(50).optional(),
  certificates: z.array(certificateSchema).max(30).optional(),
  projects: z.array(projectSchema).max(30).optional(),
  achievements: z.array(z.string().min(1).max(300)).max(30).optional(),
  languages: z.array(z.string().min(1).max(60)).max(20).optional(),
});

router.get('/', optionalAuth, async (req: AuthRequest, res) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const country = typeof req.query.country === 'string' ? req.query.country.trim() : '';

    let blockedIds: number[] = [];
    if (req.dbUser) {
      const bRows = await runQuery('profiles.blocks', () =>
        db
          .select()
          .from(blocks)
          .where(or(eq(blocks.blockerId, req.dbUser!.id), eq(blocks.blockedId, req.dbUser!.id)))
      );
      blockedIds = bRows.map((b) =>
        b.blockerId === req.dbUser!.id ? b.blockedId : b.blockerId
      );
    }

    const rows = await runQuery('profiles.search', () =>
      db
        .select({
          user: {
            id: users.id,
            fullName: users.fullName,
            email: users.email,
            status: users.status,
          },
          profile: profiles,
        })
        .from(users)
        .innerJoin(profiles, eq(profiles.userId, users.id))
        .where(
          and(
            eq(users.status, 'active'),
            ne(profiles.visibility, 'private'),
            country ? eq(profiles.country, country) : undefined,
            q
              ? or(
                  ilike(users.fullName, `%${q}%`),
                  ilike(profiles.headline, `%${q}%`),
                  ilike(profiles.location, `%${q}%`),
                  ilike(profiles.currentPosition, `%${q}%`)
                )
              : undefined
          )
        )
        .limit(40)
    );

    const results = rows
      .filter((r) => !blockedIds.includes(r.user.id))
      .map((r) => ({
        userId: r.user.id,
        fullName: r.user.fullName,
        email: r.profile.showEmail ? r.user.email : undefined,
        headline: r.profile.headline,
        location: r.profile.location,
        country: r.profile.country,
        currentPosition: r.profile.currentPosition,
        avatarUrl: r.profile.avatarUrl,
        openToWork: r.profile.openToWork,
        skills: r.profile.skills,
      }));

    res.json({ profiles: results });
  } catch {
    res.status(500).json({ error: 'Failed to search profiles' });
  }
});

router.get('/trending', optionalAuth, async (_req: AuthRequest, res) => {
  try {
    const [searchEvents, recentPosts, activeJobs, activeOrgs, memberSkills] = await Promise.all([
      runQuery('profiles.trending.searches', () =>
        db
          .select({ metadata: auditEvents.metadata })
          .from(auditEvents)
          .where(eq(auditEvents.action, 'search.query'))
          .orderBy(desc(auditEvents.createdAt))
          .limit(300)
      ),
      runQuery('profiles.trending.posts', () =>
        db
          .select({ topic: posts.topic })
          .from(posts)
          .where(eq(posts.moderationStatus, 'approved'))
          .orderBy(desc(posts.createdAt))
          .limit(100)
      ),
      runQuery('profiles.trending.jobs', () =>
        db
          .select({ title: jobs.title })
          .from(jobs)
          .where(eq(jobs.status, 'published'))
          .orderBy(desc(jobs.createdAt))
          .limit(50)
      ),
      runQuery('profiles.trending.orgs', () =>
        db
          .select({ industry: organizations.industry })
          .from(organizations)
          .where(eq(organizations.status, 'active'))
          .limit(50)
      ),
      runQuery('profiles.trending.skills', () =>
        db
          .select({ skills: profiles.skills })
          .from(profiles)
          .where(ne(profiles.visibility, 'private'))
          .limit(80)
      ),
    ]);

    const tally = new Map<string, { keyword: string; count: number; score: number; category: string }>();

    const addKeyword = (raw: string, weight: number, category: string) => {
      const cleaned = raw.trim();
      if (cleaned.length < 2 || cleaned.length > 60) return;
      const key = cleaned.toLowerCase();
      const existing = tally.get(key);
      if (existing) {
        existing.score += weight;
        if (category === 'Searched') {
          existing.count += 1;
          existing.category = 'Searched';
        }
      } else {
        tally.set(key, {
          keyword: cleaned,
          count: category === 'Searched' ? 1 : 0,
          score: weight,
          category,
        });
      }
    };

    for (const ev of searchEvents) {
      const q = typeof ev.metadata?.query === 'string' ? ev.metadata.query : '';
      if (q) addKeyword(q, 3, 'Searched');
    }
    for (const p of recentPosts) {
      if (p.topic && p.topic.toLowerCase() !== 'general') addKeyword(p.topic, 1.5, 'Topic');
    }
    for (const j of activeJobs) {
      addKeyword(j.title, 1.5, 'Job');
    }
    for (const o of activeOrgs) {
      addKeyword(o.industry, 1.2, 'Industry');
    }
    for (const m of memberSkills) {
      for (const s of m.skills || []) {
        addKeyword(s, 1, 'Skill');
      }
    }

    const keywords = Array.from(tally.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map(({ keyword, count, category }) => ({ keyword, count, category }));

    res.json({ keywords });
  } catch {
    res.status(500).json({ error: 'Failed to load trending keywords' });
  }
});

router.post('/trending', requireAuth, async (req: AuthRequest, res) => {
  const parsed = z
    .object({ query: z.string().trim().min(2).max(80) })
    .safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid search query' });
  }

  await recordAuditEvent({
    actorId: req.dbUser!.id,
    action: 'search.query',
    targetType: 'search',
    metadata: { query: parsed.data.query },
    ipAddress: getClientIp(req),
  });

  res.status(201).json({ recorded: true });
});

router.get('/:id', optionalAuth, async (req: AuthRequest, res) => {
  const targetUserId = Number(req.params.id);
  if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
    return res.status(400).json({ error: 'Invalid profile user ID' });
  }

  const viewerId = req.dbUser?.id;
  const isSelf = viewerId === targetUserId;
  const isStaff = req.dbUser && ['admin', 'superadmin', 'moderator'].includes(req.dbUser.role);

  if (viewerId && !isSelf) {
    const blocked = await runQuery('profiles.checkBlock', () =>
      db
        .select()
        .from(blocks)
        .where(
          or(
            and(eq(blocks.blockerId, viewerId), eq(blocks.blockedId, targetUserId)),
            and(eq(blocks.blockerId, targetUserId), eq(blocks.blockedId, viewerId))
          )
        )
        .limit(1)
    );
    if (blocked[0]) {
      return res.status(404).json({ error: 'Profile not found' });
    }
  }

  const rows = await runQuery('profiles.getOne', () =>
    db
      .select({ user: users, profile: profiles })
      .from(users)
      .innerJoin(profiles, eq(profiles.userId, users.id))
      .where(eq(users.id, targetUserId))
      .limit(1)
  );
  if (!rows[0] || (rows[0].user.status === 'suspended' && !isStaff)) {
    return res.status(404).json({ error: 'Profile not found' });
  }

  const { user, profile } = rows[0];

  const [connList, relationRows, followRows] = await Promise.all([
    runQuery('profiles.connCount', () =>
      db
        .select({ id: connections.id })
        .from(connections)
        .where(
          and(
            eq(connections.status, 'accepted'),
            or(eq(connections.requesterId, targetUserId), eq(connections.recipientId, targetUserId))
          )
        )
    ),
    viewerId && !isSelf
      ? runQuery('profiles.checkRelation', () =>
          db
            .select()
            .from(connections)
            .where(
              or(
                and(eq(connections.requesterId, viewerId), eq(connections.recipientId, targetUserId)),
                and(eq(connections.requesterId, targetUserId), eq(connections.recipientId, viewerId))
              )
            )
            .limit(1)
        )
      : Promise.resolve([]),
    viewerId && !isSelf
      ? runQuery('profiles.checkFollow', () =>
          db
            .select()
            .from(follows)
            .where(and(eq(follows.followerId, viewerId), eq(follows.followingId, targetUserId)))
            .limit(1)
        )
      : Promise.resolve([]),
  ]);

  const rel = relationRows[0];
  let connectionStatus: 'none' | 'pending_sent' | 'pending_received' | 'connected' = 'none';
  if (rel?.status === 'accepted') {
    connectionStatus = 'connected';
  } else if (rel?.status === 'pending') {
    connectionStatus = rel.requesterId === viewerId ? 'pending_sent' : 'pending_received';
  }

  if (profile.visibility === 'private' && !isSelf && !isStaff) {
    return res.status(403).json({ error: 'This profile is set to private' });
  }

  if (profile.visibility === 'connections' && !isSelf && !isStaff && connectionStatus !== 'connected') {
    return res.status(403).json({
      error: 'Profile is visible to connections only',
      meta: {
        isSelf: false,
        connectionsCount: connList.length,
        connectionStatus,
        connectionId: rel?.id ?? null,
        isFollowing: Boolean(followRows[0]),
      },
    });
  }

  res.json({
    profile: {
      ...profile,
      fullName: user.fullName,
      email: isSelf || isStaff || profile.showEmail ? user.email : undefined,
    },
    meta: {
      isSelf,
      connectionsCount: connList.length,
      connectionStatus,
      connectionId: rel?.id ?? null,
      isFollowing: Boolean(followRows[0]),
    },
  });
});

router.put('/me', requireAuth, async (req: AuthRequest, res) => {
  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid profile data', details: parsed.error.flatten() });
  }

  const userId = req.dbUser!.id;
  const { fullName, ...profileFields } = parsed.data;

  if (fullName) {
    await runQuery('profiles.updateUserName', () =>
      db
        .update(users)
        .set({ fullName, updatedAt: new Date() })
        .where(eq(users.id, userId))
    );
  }

  const updated = await runQuery('profiles.updateMe', () =>
    db
      .update(profiles)
      .set({ ...profileFields, updatedAt: new Date() })
      .where(eq(profiles.userId, userId))
      .returning()
  );

  res.json({ profile: updated[0], fullName: fullName ?? req.dbUser!.fullName });
});

export default router;
