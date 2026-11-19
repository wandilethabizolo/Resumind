import { Router } from 'express';
import { and, desc, eq, ilike, inArray, or } from 'drizzle-orm';
import { z } from 'zod';
import { db, runQuery } from '../../db/index.ts';
import {
  applicationHistory,
  auditEvents,
  cvDocuments,
  interviews,
  jobApplications,
  jobs,
  organizationMembers,
  organizations,
  profiles,
  talentPoolMembers,
  talentPools,
  users,
} from '../../db/schema.ts';
import {
  AuthRequest,
  getUserOrgMembership,
  requireAuth,
  requireOrgRole,
} from '../middleware/auth.ts';
import { getClientIp, recordAuditEvent } from '../services/audit.ts';
import {
  draftJobDescriptionWithGemini,
  enforceAiFairUse,
  explainCandidateMatchWithGemini,
  generateInterviewQuestionsWithGemini,
} from '../services/gemini.ts';
import { createNotification } from '../services/notifications.ts';

const router = Router();

const ALL_ORG_ROLES = ['owner', 'admin', 'recruiter', 'hiring_manager', 'interviewer', 'viewer'];
const RECRUITING_ROLES = ['owner', 'admin', 'recruiter'];
const INTERVIEW_FEEDBACK_ROLES = ['owner', 'admin', 'recruiter', 'hiring_manager', 'interviewer'];

router.get('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.dbUser!.id;
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';

    const allOrgs = await runQuery('orgs.list', () =>
      db
        .select()
        .from(organizations)
        .where(
          and(
            eq(organizations.status, 'active'),
            q
              ? or(
                  ilike(organizations.name, `%${q}%`),
                  ilike(organizations.industry, `%${q}%`),
                  ilike(organizations.location, `%${q}%`),
                  ilike(organizations.country, `%${q}%`)
                )
              : undefined
          )
        )
        .limit(40)
    );
    const myMemberships = await runQuery('orgs.myMemberships', () =>
      db
        .select()
        .from(organizationMembers)
        .where(and(eq(organizationMembers.userId, userId), eq(organizationMembers.status, 'active')))
    );
    const roleMap = new Map(myMemberships.map((m) => [m.organizationId, m.role]));

    res.json({
      organizations: allOrgs.map((o) => ({
        ...o,
        memberRole: roleMap.get(o.id) ?? null,
      })),
    });
  } catch {
    res.status(500).json({ error: 'Failed to load organizations' });
  }
});

router.post('/', requireAuth, async (req: AuthRequest, res) => {
  const schema = z.object({
    name: z.string().min(2).max(160),
    industry: z.string().min(2).max(120).default('Technology'),
    location: z.string().min(2).max(120).default('Mbabane'),
    country: z.string().min(2).max(120).default('Eswatini'),
    website: z.string().max(400).default(''),
    description: z.string().max(2500).default(''),
    size: z.string().max(60).default('11-50 employees'),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid organization data', details: parsed.error.flatten() });
  }

  const slugBase = parsed.data.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
  const slug = `${slugBase || 'org'}-${Date.now().toString(36)}`;

  const [org] = await runQuery('orgs.create', () =>
    db
      .insert(organizations)
      .values({
        name: parsed.data.name.trim(),
        slug,
        industry: parsed.data.industry.trim(),
        location: parsed.data.location.trim(),
        country: parsed.data.country.trim(),
        website: parsed.data.website.trim(),
        description: parsed.data.description.trim(),
        size: parsed.data.size.trim(),
        coverUrl: '',
        createdById: req.dbUser!.id,
      })
      .returning()
  );

  await runQuery('orgs.addOwner', () =>
    db.insert(organizationMembers).values({
      organizationId: org.id,
      userId: req.dbUser!.id,
      role: 'owner',
      status: 'active',
    })
  );

  await recordAuditEvent({
    actorId: req.dbUser!.id,
    action: 'organization.created',
    targetType: 'organization',
    targetId: org.id,
    ipAddress: getClientIp(req),
  });

  res.status(201).json({ organization: { ...org, memberRole: 'owner' } });
});

router.patch(
  '/:id',
  requireAuth,
  requireOrgRole(['owner', 'admin']),
  async (req: AuthRequest, res) => {
    const orgId = Number(req.params.id);
    const schema = z.object({
      name: z.string().min(2).max(160).optional(),
      industry: z.string().min(2).max(120).optional(),
      location: z.string().min(2).max(120).optional(),
      country: z.string().min(2).max(120).optional(),
      website: z.string().max(400).optional(),
      description: z.string().max(2500).optional(),
      size: z.string().max(60).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid organization update' });
    }

    const updated = await runQuery('orgs.update', () =>
      db
        .update(organizations)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(eq(organizations.id, orgId))
        .returning()
    );
    await recordAuditEvent({
      actorId: req.dbUser!.id,
      action: 'organization.updated',
      targetType: 'organization',
      targetId: orgId,
      ipAddress: getClientIp(req),
    });
    res.json({ organization: updated[0] });
  }
);

router.post(
  '/:id/verify-request',
  requireAuth,
  requireOrgRole(['owner', 'admin']),
  async (req: AuthRequest, res) => {
    const orgId = Number(req.params.id);
    const updated = await runQuery('orgs.requestVerify', () =>
      db
        .update(organizations)
        .set({ verificationStatus: 'pending', updatedAt: new Date() })
        .where(eq(organizations.id, orgId))
        .returning()
    );
    await recordAuditEvent({
      actorId: req.dbUser!.id,
      action: 'organization.verification_requested',
      targetType: 'organization',
      targetId: orgId,
      ipAddress: getClientIp(req),
    });
    res.json({ organization: updated[0] });
  }
);

router.get(
  '/:id/members',
  requireAuth,
  requireOrgRole(ALL_ORG_ROLES),
  async (req: AuthRequest, res) => {
    const orgId = Number(req.params.id);
    const rows = await runQuery('orgs.members', () =>
      db
        .select({
          member: organizationMembers,
          fullName: users.fullName,
          email: users.email,
          headline: profiles.headline,
        })
        .from(organizationMembers)
        .innerJoin(users, eq(organizationMembers.userId, users.id))
        .innerJoin(profiles, eq(profiles.userId, users.id))
        .where(
          and(
            eq(organizationMembers.organizationId, orgId),
            inArray(organizationMembers.status, ['active', 'suspended'])
          )
        )
    );
    res.json({
      members: rows.map((r) => ({
        ...r.member,
        fullName: r.fullName,
        email: r.email,
        headline: r.headline,
      })),
    });
  }
);

router.post(
  '/:id/members',
  requireAuth,
  requireOrgRole(['owner', 'admin']),
  async (req: AuthRequest, res) => {
    const orgId = Number(req.params.id);
    const schema = z.object({
      email: z.string().email(),
      role: z.enum(['admin', 'recruiter', 'hiring_manager', 'interviewer', 'viewer']),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Valid email and role required' });
    }

    const targetUsers = await runQuery('orgs.findMemberUser', () =>
      db
        .select()
        .from(users)
        .where(eq(users.email, parsed.data.email.toLowerCase()))
        .limit(1)
    );
    if (!targetUsers[0]) {
      return res.status(404).json({ error: 'No registered ResuMind user found with that email' });
    }

    const existingOwner = await runQuery('orgs.checkExistingMember', () =>
      db
        .select()
        .from(organizationMembers)
        .where(
          and(
            eq(organizationMembers.organizationId, orgId),
            eq(organizationMembers.userId, targetUsers[0].id)
          )
        )
        .limit(1)
    );
    if (existingOwner[0]?.role === 'owner') {
      return res.status(400).json({ error: 'Cannot reassign organization owner role' });
    }

    const inserted = await runQuery('orgs.upsertMember', () =>
      db
        .insert(organizationMembers)
        .values({
          organizationId: orgId,
          userId: targetUsers[0].id,
          role: parsed.data.role,
          status: 'active',
        })
        .onConflictDoUpdate({
          target: [organizationMembers.organizationId, organizationMembers.userId],
          set: { role: parsed.data.role, status: 'active' },
        })
        .returning()
    );

    await createNotification({
      userId: targetUsers[0].id,
      actorId: req.dbUser!.id,
      type: 'organization_invite',
      title: `You were added as ${parsed.data.role.replace('_', ' ')} to an organization workspace`,
      linkTab: 'employers',
      entityId: orgId,
    });

    await recordAuditEvent({
      actorId: req.dbUser!.id,
      action: 'organization.member_added',
      targetType: 'organization',
      targetId: orgId,
      metadata: { targetUserId: targetUsers[0].id, role: parsed.data.role },
      ipAddress: getClientIp(req),
    });

    res.status(201).json({ member: inserted[0] });
  }
);

router.delete(
  '/:id/members/:memberId',
  requireAuth,
  requireOrgRole(['owner', 'admin']),
  async (req: AuthRequest, res) => {
    const orgId = Number(req.params.id);
    const memberId = Number(req.params.memberId);
    const rows = await runQuery('orgs.findMemberDel', () =>
      db
        .select()
        .from(organizationMembers)
        .where(and(eq(organizationMembers.id, memberId), eq(organizationMembers.organizationId, orgId)))
        .limit(1)
    );
    if (!rows[0]) {
      return res.status(404).json({ error: 'Team member not found' });
    }
    if (rows[0].role === 'owner') {
      return res.status(400).json({ error: 'Cannot remove organization owner' });
    }

    await runQuery('orgs.removeMember', () =>
      db
        .update(organizationMembers)
        .set({ status: 'removed' })
        .where(eq(organizationMembers.id, memberId))
    );
    await recordAuditEvent({
      actorId: req.dbUser!.id,
      action: 'organization.member_removed',
      targetType: 'organization',
      targetId: orgId,
      metadata: { memberId, targetUserId: rows[0].userId },
      ipAddress: getClientIp(req),
    });
    res.json({ removed: true });
  }
);

router.patch(
  '/:id/members/:memberId',
  requireAuth,
  requireOrgRole(['owner', 'admin']),
  async (req: AuthRequest, res) => {
    const orgId = Number(req.params.id);
    const memberId = Number(req.params.memberId);
    const schema = z.object({
      role: z.enum(['admin', 'recruiter', 'hiring_manager', 'interviewer', 'viewer']).optional(),
      status: z.enum(['active', 'suspended']).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid member update payload' });
    }

    const rows = await runQuery('orgs.findMemberUpdate', () =>
      db
        .select()
        .from(organizationMembers)
        .where(and(eq(organizationMembers.id, memberId), eq(organizationMembers.organizationId, orgId)))
        .limit(1)
    );
    if (!rows[0]) {
      return res.status(404).json({ error: 'Team member not found' });
    }
    if (rows[0].role === 'owner') {
      return res.status(400).json({ error: 'Cannot modify organization owner role or status' });
    }

    const updated = await runQuery('orgs.updateMember', () =>
      db
        .update(organizationMembers)
        .set({
          role: parsed.data.role ?? rows[0].role,
          status: parsed.data.status ?? rows[0].status,
        })
        .where(eq(organizationMembers.id, memberId))
        .returning()
    );

    await recordAuditEvent({
      actorId: req.dbUser!.id,
      action: 'organization.member_updated',
      targetType: 'organization',
      targetId: orgId,
      metadata: { memberId, ...parsed.data },
      ipAddress: getClientIp(req),
    });

    res.json({ member: updated[0] });
  }
);

router.get(
  '/:id/jobs',
  requireAuth,
  requireOrgRole(ALL_ORG_ROLES),
  async (req: AuthRequest, res) => {
    const orgId = Number(req.params.id);
    const rows = await runQuery('orgs.jobs', () =>
      db.select().from(jobs).where(eq(jobs.organizationId, orgId)).orderBy(desc(jobs.createdAt))
    );
    const jobIds = rows.map((j) => j.id);
    const appCounts = new Map<number, number>();
    if (jobIds.length > 0) {
      const apps = await runQuery('orgs.jobAppCounts', () =>
        db
          .select({ jobId: jobApplications.jobId })
          .from(jobApplications)
          .where(inArray(jobApplications.jobId, jobIds))
      );
      for (const a of apps) {
        appCounts.set(a.jobId, (appCounts.get(a.jobId) ?? 0) + 1);
      }
    }

    res.json({
      jobs: rows.map((j) => ({
        ...j,
        applicantCount: appCounts.get(j.id) ?? 0,
      })),
    });
  }
);

router.post(
  '/:id/jobs',
  requireAuth,
  requireOrgRole(RECRUITING_ROLES),
  async (req: AuthRequest, res) => {
    const orgId = Number(req.params.id);
    const schema = z.object({
      title: z.string().min(2).max(160),
      department: z.string().min(1).max(120).default('General'),
      description: z.string().min(10).max(8000),
      requirements: z.string().max(4000).default(''),
      location: z.string().min(2).max(120),
      country: z.string().min(2).max(120).default('Eswatini'),
      workArrangement: z.enum(['remote', 'hybrid', 'onsite']).default('hybrid'),
      employmentType: z
        .enum(['full-time', 'part-time', 'contract', 'internship'])
        .default('full-time'),
      experienceLevel: z.enum(['entry', 'mid', 'senior', 'executive']).default('mid'),
      salaryRange: z.string().max(120).default(''),
      status: z.enum(['draft', 'published', 'paused', 'closed', 'archived']).default('published'),
      expiresAt: z.string().optional().nullable(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: 'Invalid job vacancy payload', details: parsed.error.flatten() });
    }

    const orgRows = await runQuery('orgs.checkStatusForJob', () =>
      db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1)
    );
    if (!orgRows[0] || orgRows[0].status === 'suspended') {
      return res.status(403).json({ error: 'Organization is suspended' });
    }

    const { expiresAt, ...rest } = parsed.data;
    const expiresDate = expiresAt ? new Date(expiresAt) : null;

    const inserted = await runQuery('orgs.createJob', () =>
      db
        .insert(jobs)
        .values({
          organizationId: orgId,
          postedById: req.dbUser!.id,
          ...rest,
          expiresAt: expiresDate && !Number.isNaN(expiresDate.getTime()) ? expiresDate : null,
        })
        .returning()
    );

    await recordAuditEvent({
      actorId: req.dbUser!.id,
      action: 'job.created',
      targetType: 'job',
      targetId: inserted[0].id,
      metadata: { organizationId: orgId, status: inserted[0].status },
      ipAddress: getClientIp(req),
    });

    res.status(201).json({ job: { ...inserted[0], applicantCount: 0 } });
  }
);

router.patch(
  '/:id/jobs/:jobId',
  requireAuth,
  requireOrgRole(RECRUITING_ROLES),
  async (req: AuthRequest, res) => {
    const orgId = Number(req.params.id);
    const jobId = Number(req.params.jobId);
    const schema = z.object({
      title: z.string().min(2).max(160).optional(),
      department: z.string().min(1).max(120).optional(),
      description: z.string().min(10).max(8000).optional(),
      requirements: z.string().max(4000).optional(),
      location: z.string().max(120).optional(),
      country: z.string().max(120).optional(),
      workArrangement: z.enum(['remote', 'hybrid', 'onsite']).optional(),
      employmentType: z.enum(['full-time', 'part-time', 'contract', 'internship']).optional(),
      experienceLevel: z.enum(['entry', 'mid', 'senior', 'executive']).optional(),
      salaryRange: z.string().max(120).optional(),
      status: z.enum(['draft', 'published', 'paused', 'closed', 'archived']).optional(),
      expiresAt: z.string().optional().nullable(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid job update' });
    }

    const { expiresAt, ...rest } = parsed.data;
    const updateData: Record<string, unknown> = { ...rest, updatedAt: new Date() };
    if (expiresAt !== undefined) {
      const dt = expiresAt ? new Date(expiresAt) : null;
      updateData.expiresAt = dt && !Number.isNaN(dt.getTime()) ? dt : null;
    }

    const updated = await runQuery('orgs.updateJob', () =>
      db
        .update(jobs)
        .set(updateData)
        .where(and(eq(jobs.id, jobId), eq(jobs.organizationId, orgId)))
        .returning()
    );
    if (!updated[0]) {
      return res.status(404).json({ error: 'Job not found in this organization' });
    }
    res.json({ job: updated[0] });
  }
);

router.get(
  '/:id/applications',
  requireAuth,
  requireOrgRole(ALL_ORG_ROLES),
  async (req: AuthRequest, res) => {
    const orgId = Number(req.params.id);
    const rows = await runQuery('orgs.applications', () =>
      db
        .select({
          application: jobApplications,
          job: jobs,
          applicant: {
            id: users.id,
            fullName: users.fullName,
            email: users.email,
          },
          profile: {
            headline: profiles.headline,
            location: profiles.location,
            country: profiles.country,
            skills: profiles.skills,
            avatarUrl: profiles.avatarUrl,
          },
          cvDocument: {
            id: cvDocuments.id,
            title: cvDocuments.title,
            fileName: cvDocuments.fileName,
            extractedText: cvDocuments.extractedText,
          },
        })
        .from(jobApplications)
        .innerJoin(jobs, eq(jobApplications.jobId, jobs.id))
        .innerJoin(users, eq(jobApplications.applicantId, users.id))
        .innerJoin(profiles, eq(profiles.userId, users.id))
        .leftJoin(cvDocuments, eq(jobApplications.cvDocumentId, cvDocuments.id))
        .where(eq(jobs.organizationId, orgId))
        .orderBy(desc(jobApplications.createdAt))
    );

    const appIds = rows.map((r) => r.application.id);
    const historyMap = new Map<
      number,
      Array<{ id: number; fromStage: string; toStage: string; note: string; createdAt: Date }>
    >();
    if (appIds.length > 0) {
      const historyRows = await runQuery('orgs.appHistory', () =>
        db
          .select()
          .from(applicationHistory)
          .where(inArray(applicationHistory.applicationId, appIds))
          .orderBy(desc(applicationHistory.createdAt))
      );
      for (const h of historyRows) {
        const list = historyMap.get(h.applicationId) || [];
        list.push(h);
        historyMap.set(h.applicationId, list);
      }
    }

    res.json({
      applications: rows.map((r) => ({
        ...r.application,
        jobTitle: r.job.title,
        jobDescription: r.job.description,
        jobRequirements: r.job.requirements,
        applicant: r.applicant,
        profile: r.profile,
        cvDocument: r.cvDocument?.id ? r.cvDocument : null,
        history: historyMap.get(r.application.id) || [],
      })),
    });
  }
);

router.patch(
  '/:id/applications/:appId/stage',
  requireAuth,
  requireOrgRole(['owner', 'admin', 'recruiter', 'hiring_manager']),
  async (req: AuthRequest, res) => {
    const orgId = Number(req.params.id);
    const appId = Number(req.params.appId);
    const schema = z.object({
      stage: z.enum([
        'submitted',
        'screening',
        'shortlisted',
        'interview',
        'offer',
        'hired',
        'rejected',
      ]),
      employerNotes: z.string().max(3000).optional(),
      note: z.string().max(500).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid recruitment stage update' });
    }

    const appRows = await runQuery('orgs.verifyAppOrg', () =>
      db
        .select({ application: jobApplications, job: jobs })
        .from(jobApplications)
        .innerJoin(jobs, eq(jobApplications.jobId, jobs.id))
        .where(and(eq(jobApplications.id, appId), eq(jobs.organizationId, orgId)))
        .limit(1)
    );
    if (!appRows[0]) {
      return res.status(404).json({ error: 'Application not found for this organization' });
    }

    const previousStage = appRows[0].application.stage;
    const updated = await runQuery('orgs.updateAppStage', () =>
      db
        .update(jobApplications)
        .set({
          stage: parsed.data.stage,
          employerNotes:
            parsed.data.employerNotes !== undefined
              ? parsed.data.employerNotes
              : appRows[0].application.employerNotes,
          updatedAt: new Date(),
        })
        .where(eq(jobApplications.id, appId))
        .returning()
    );

    if (previousStage !== parsed.data.stage || parsed.data.note) {
      await runQuery('orgs.insertAppHistory', () =>
        db.insert(applicationHistory).values({
          applicationId: appId,
          fromStage: previousStage,
          toStage: parsed.data.stage,
          changedById: req.dbUser!.id,
          note: parsed.data.note || '',
        })
      );
    }

    if (previousStage !== parsed.data.stage) {
      await createNotification({
        userId: appRows[0].application.applicantId,
        actorId: req.dbUser!.id,
        type: 'application_stage',
        title: `Application update: ${appRows[0].job.title}`,
        body: `Your application moved to "${parsed.data.stage}" stage.`,
        linkTab: 'jobs',
        entityId: appRows[0].job.id,
      });
    }

    await recordAuditEvent({
      actorId: req.dbUser!.id,
      action: 'application.stage_updated',
      targetType: 'job_application',
      targetId: appId,
      metadata: { organizationId: orgId, fromStage: previousStage, stage: parsed.data.stage },
      ipAddress: getClientIp(req),
    });

    res.json({ application: updated[0] });
  }
);

router.patch(
  '/:id/applications/:appId/notes',
  requireAuth,
  requireOrgRole(INTERVIEW_FEEDBACK_ROLES),
  async (req: AuthRequest, res) => {
    const orgId = Number(req.params.id);
    const appId = Number(req.params.appId);
    const schema = z.object({
      employerNotes: z.string().max(3000),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid notes payload' });
    }

    const appRows = await runQuery('orgs.verifyAppForNotes', () =>
      db
        .select({ application: jobApplications })
        .from(jobApplications)
        .innerJoin(jobs, eq(jobApplications.jobId, jobs.id))
        .where(and(eq(jobApplications.id, appId), eq(jobs.organizationId, orgId)))
        .limit(1)
    );
    if (!appRows[0]) {
      return res.status(404).json({ error: 'Application not found for this organization' });
    }

    const updated = await runQuery('orgs.saveAppNotes', () =>
      db
        .update(jobApplications)
        .set({ employerNotes: parsed.data.employerNotes, updatedAt: new Date() })
        .where(eq(jobApplications.id, appId))
        .returning()
    );
    res.json({ application: updated[0] });
  }
);

// Privacy-aware Talent Search: strictly public profiles, no private CVs exposed
router.get(
  '/:id/talent',
  requireAuth,
  requireOrgRole(RECRUITING_ROLES),
  async (req: AuthRequest, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
    const location =
      typeof req.query.location === 'string' ? req.query.location.trim().toLowerCase() : '';
    const skill = typeof req.query.skill === 'string' ? req.query.skill.trim().toLowerCase() : '';
    const openToWorkOnly = req.query.openToWork === 'true';
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(25, Math.max(1, Number(req.query.limit) || 10));

    const rows = await runQuery('orgs.talentSearch', () =>
      db
        .select({
          userId: users.id,
          fullName: users.fullName,
          headline: profiles.headline,
          about: profiles.about,
          location: profiles.location,
          country: profiles.country,
          avatarUrl: profiles.avatarUrl,
          skills: profiles.skills,
          openToWork: profiles.openToWork,
          experiences: profiles.experiences,
          education: profiles.education,
        })
        .from(profiles)
        .innerJoin(users, eq(profiles.userId, users.id))
        .where(and(eq(users.status, 'active'), eq(profiles.visibility, 'public')))
        .limit(120)
    );

    const filtered = rows.filter((r) => {
      if (openToWorkOnly && !r.openToWork) return false;
      if (q) {
        const expText = (r.experiences || []).map((e) => `${e.title} ${e.company}`).join(' ');
        const eduText = (r.education || []).map((ed) => `${ed.institution} ${ed.degree} ${ed.field}`).join(' ');
        const hay = `${r.fullName} ${r.headline} ${r.about} ${expText} ${eduText} ${(r.skills || []).join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (location) {
        const locHay = `${r.location} ${r.country}`.toLowerCase();
        if (!locHay.includes(location)) return false;
      }
      if (skill) {
        const skillMatch = (r.skills || []).some((s) => s.toLowerCase().includes(skill));
        if (!skillMatch) return false;
      }
      return true;
    });

    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * limit;
    const candidates = filtered.slice(start, start + limit);

    res.json({ candidates, total, page: safePage, totalPages });
  }
);

router.post(
  '/:id/talent/:candidateId/invite',
  requireAuth,
  requireOrgRole(RECRUITING_ROLES),
  async (req: AuthRequest, res) => {
    const orgId = Number(req.params.id);
    const candidateId = Number(req.params.candidateId);
    const schema = z.object({
      jobId: z.number().int().positive(),
      message: z.string().max(400).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Valid vacancy selection required' });
    }

    const [jobRows, orgRows, candidateRows] = await Promise.all([
      runQuery('orgs.inviteFindJob', () =>
        db
          .select()
          .from(jobs)
          .where(and(eq(jobs.id, parsed.data.jobId), eq(jobs.organizationId, orgId)))
          .limit(1)
      ),
      runQuery('orgs.inviteFindOrg', () =>
        db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1)
      ),
      runQuery('orgs.inviteFindCandidate', () =>
        db
          .select({ userId: profiles.userId, visibility: profiles.visibility })
          .from(profiles)
          .innerJoin(users, eq(profiles.userId, users.id))
          .where(and(eq(profiles.userId, candidateId), eq(users.status, 'active')))
          .limit(1)
      ),
    ]);

    if (!jobRows[0] || jobRows[0].status !== 'published') {
      return res.status(404).json({ error: 'Select a published vacancy from this organization' });
    }
    if (!candidateRows[0] || candidateRows[0].visibility !== 'public') {
      return res.status(404).json({ error: 'Candidate profile is not open for discovery' });
    }

    const companyName = orgRows[0]?.name || 'An employer on ResuMind';
    await createNotification({
      userId: candidateId,
      actorId: req.dbUser!.id,
      type: 'job_invitation',
      title: `Invitation to apply: ${jobRows[0].title}`,
      body:
        parsed.data.message?.trim() ||
        `${companyName} invited you to review and apply for "${jobRows[0].title}".`,
      linkTab: 'jobs',
      entityId: jobRows[0].id,
    });

    await recordAuditEvent({
      actorId: req.dbUser!.id,
      action: 'talent.invited_to_apply',
      targetType: 'job',
      targetId: jobRows[0].id,
      metadata: { organizationId: orgId, candidateId },
      ipAddress: getClientIp(req),
    });

    res.json({ invited: true });
  }
);

// Company-isolated Talent Pools
router.get(
  '/:id/talent-pools',
  requireAuth,
  requireOrgRole(ALL_ORG_ROLES),
  async (req: AuthRequest, res) => {
    const orgId = Number(req.params.id);
    const pools = await runQuery('orgs.listPools', () =>
      db
        .select()
        .from(talentPools)
        .where(eq(talentPools.organizationId, orgId))
        .orderBy(desc(talentPools.createdAt))
    );

    const poolIds = pools.map((p) => p.id);
    const membersByPool = new Map<
      number,
      Array<{
        id: number;
        userId: number;
        fullName: string;
        headline: string;
        location: string;
        skills: string[];
        notes: string;
      }>
    >();
    if (poolIds.length > 0) {
      const rows = await runQuery('orgs.listPoolMembers', () =>
        db
          .select({
            member: talentPoolMembers,
            fullName: users.fullName,
            headline: profiles.headline,
            location: profiles.location,
            skills: profiles.skills,
          })
          .from(talentPoolMembers)
          .innerJoin(users, eq(talentPoolMembers.userId, users.id))
          .innerJoin(profiles, eq(profiles.userId, users.id))
          .where(inArray(talentPoolMembers.poolId, poolIds))
      );
      for (const r of rows) {
        const list = membersByPool.get(r.member.poolId) || [];
        list.push({
          id: r.member.id,
          userId: r.member.userId,
          fullName: r.fullName,
          headline: r.headline,
          location: r.location,
          skills: r.skills,
          notes: r.member.notes,
        });
        membersByPool.set(r.member.poolId, list);
      }
    }

    res.json({
      pools: pools.map((p) => ({
        ...p,
        members: membersByPool.get(p.id) || [],
      })),
    });
  }
);

router.post(
  '/:id/talent-pools',
  requireAuth,
  requireOrgRole(RECRUITING_ROLES),
  async (req: AuthRequest, res) => {
    const orgId = Number(req.params.id);
    const schema = z.object({
      name: z.string().min(2).max(120),
      description: z.string().max(400).default(''),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid talent pool details' });
    }
    const [pool] = await runQuery('orgs.createPool', () =>
      db
        .insert(talentPools)
        .values({
          organizationId: orgId,
          name: parsed.data.name.trim(),
          description: parsed.data.description.trim(),
          createdById: req.dbUser!.id,
        })
        .returning()
    );
    res.status(201).json({ pool: { ...pool, members: [] } });
  }
);

router.post(
  '/:id/talent-pools/:poolId/members',
  requireAuth,
  requireOrgRole(RECRUITING_ROLES),
  async (req: AuthRequest, res) => {
    const orgId = Number(req.params.id);
    const poolId = Number(req.params.poolId);
    const schema = z.object({
      userId: z.number().int().positive(),
      notes: z.string().max(500).default(''),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid candidate selection' });
    }

    const poolRows = await runQuery('orgs.verifyPoolOrg', () =>
      db
        .select()
        .from(talentPools)
        .where(and(eq(talentPools.id, poolId), eq(talentPools.organizationId, orgId)))
        .limit(1)
    );
    if (!poolRows[0]) {
      return res.status(404).json({ error: 'Talent pool not found' });
    }

    const inserted = await runQuery('orgs.addPoolMember', () =>
      db
        .insert(talentPoolMembers)
        .values({
          poolId,
          userId: parsed.data.userId,
          addedById: req.dbUser!.id,
          notes: parsed.data.notes.trim(),
        })
        .onConflictDoUpdate({
          target: [talentPoolMembers.poolId, talentPoolMembers.userId],
          set: { notes: parsed.data.notes.trim() },
        })
        .returning()
    );
    res.status(201).json({ member: inserted[0] });
  }
);

router.delete(
  '/:id/talent-pools/:poolId/members/:memberId',
  requireAuth,
  requireOrgRole(RECRUITING_ROLES),
  async (req: AuthRequest, res) => {
    const orgId = Number(req.params.id);
    const poolId = Number(req.params.poolId);
    const memberId = Number(req.params.memberId);

    const poolRows = await runQuery('orgs.verifyPoolOrgDel', () =>
      db
        .select()
        .from(talentPools)
        .where(and(eq(talentPools.id, poolId), eq(talentPools.organizationId, orgId)))
        .limit(1)
    );
    if (!poolRows[0]) {
      return res.status(404).json({ error: 'Talent pool not found' });
    }
    await runQuery('orgs.delPoolMember', () =>
      db
        .delete(talentPoolMembers)
        .where(and(eq(talentPoolMembers.id, memberId), eq(talentPoolMembers.poolId, poolId)))
    );
    res.json({ removed: true });
  }
);

// Interviews Management
router.get(
  '/:id/interviews',
  requireAuth,
  requireOrgRole(ALL_ORG_ROLES),
  async (req: AuthRequest, res) => {
    const orgId = Number(req.params.id);
    const rows = await runQuery('orgs.listInterviews', () =>
      db
        .select({
          interview: interviews,
          jobTitle: jobs.title,
          candidateName: users.fullName,
          candidateId: users.id,
        })
        .from(interviews)
        .innerJoin(jobApplications, eq(interviews.applicationId, jobApplications.id))
        .innerJoin(jobs, eq(jobApplications.jobId, jobs.id))
        .innerJoin(users, eq(jobApplications.applicantId, users.id))
        .where(eq(interviews.organizationId, orgId))
        .orderBy(desc(interviews.scheduledAt))
    );
    res.json({
      interviews: rows.map((r) => ({
        ...r.interview,
        jobTitle: r.jobTitle,
        candidateName: r.candidateName,
        candidateId: r.candidateId,
      })),
    });
  }
);

router.post(
  '/:id/interviews',
  requireAuth,
  requireOrgRole(['owner', 'admin', 'recruiter', 'hiring_manager']),
  async (req: AuthRequest, res) => {
    const orgId = Number(req.params.id);
    const schema = z.object({
      applicationId: z.number().int().positive(),
      interviewType: z.enum(['video', 'in_person', 'phone']).default('video'),
      scheduledAt: z.string().min(4),
      locationOrLink: z.string().max(400).default(''),
      notes: z.string().max(2000).default(''),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid interview schedule payload' });
    }

    const scheduledDate = new Date(parsed.data.scheduledAt);
    if (Number.isNaN(scheduledDate.getTime())) {
      return res.status(400).json({ error: 'Invalid interview date/time' });
    }

    const appRows = await runQuery('orgs.verifyAppForInterview', () =>
      db
        .select({ application: jobApplications, job: jobs })
        .from(jobApplications)
        .innerJoin(jobs, eq(jobApplications.jobId, jobs.id))
        .where(
          and(
            eq(jobApplications.id, parsed.data.applicationId),
            eq(jobs.organizationId, orgId)
          )
        )
        .limit(1)
    );
    if (!appRows[0]) {
      return res.status(404).json({ error: 'Application not found for this organization' });
    }

    const [created] = await runQuery('orgs.createInterview', () =>
      db
        .insert(interviews)
        .values({
          organizationId: orgId,
          applicationId: parsed.data.applicationId,
          scheduledById: req.dbUser!.id,
          interviewType: parsed.data.interviewType,
          scheduledAt: scheduledDate,
          locationOrLink: parsed.data.locationOrLink.trim(),
          notes: parsed.data.notes.trim(),
        })
        .returning()
    );

    if (['submitted', 'screening', 'shortlisted'].includes(appRows[0].application.stage)) {
      await runQuery('orgs.moveAppToInterview', () =>
        db
          .update(jobApplications)
          .set({ stage: 'interview', updatedAt: new Date() })
          .where(eq(jobApplications.id, appRows[0].application.id))
      );
      await runQuery('orgs.interviewStageHistory', () =>
        db.insert(applicationHistory).values({
          applicationId: appRows[0].application.id,
          fromStage: appRows[0].application.stage,
          toStage: 'interview',
          changedById: req.dbUser!.id,
          note: `Interview scheduled (${parsed.data.interviewType})`,
        })
      );
    }

    await createNotification({
      userId: appRows[0].application.applicantId,
      actorId: req.dbUser!.id,
      type: 'interview_scheduled',
      title: `Interview invitation: ${appRows[0].job.title}`,
      body: `Scheduled for ${scheduledDate.toLocaleString()} (${parsed.data.interviewType.replace('_', ' ')}).`,
      linkTab: 'jobs',
      entityId: appRows[0].job.id,
    });

    await recordAuditEvent({
      actorId: req.dbUser!.id,
      action: 'interview.scheduled',
      targetType: 'interview',
      targetId: created.id,
      metadata: { organizationId: orgId, applicationId: parsed.data.applicationId },
      ipAddress: getClientIp(req),
    });

    res.status(201).json({ interview: created });
  }
);

router.patch(
  '/:id/interviews/:interviewId',
  requireAuth,
  requireOrgRole(INTERVIEW_FEEDBACK_ROLES),
  async (req: AuthRequest, res) => {
    const orgId = Number(req.params.id);
    const interviewId = Number(req.params.interviewId);
    const schema = z.object({
      status: z.enum(['scheduled', 'completed', 'cancelled']).optional(),
      feedback: z.string().max(3000).optional(),
      outcome: z.enum(['pending', 'pass', 'hold', 'reject']).optional(),
      scheduledAt: z.string().optional(),
      locationOrLink: z.string().max(400).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid interview update' });
    }

    const updateSet: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.data.status) updateSet.status = parsed.data.status;
    if (parsed.data.feedback !== undefined) updateSet.feedback = parsed.data.feedback;
    if (parsed.data.outcome) updateSet.outcome = parsed.data.outcome;
    if (parsed.data.locationOrLink !== undefined)
      updateSet.locationOrLink = parsed.data.locationOrLink;
    if (parsed.data.scheduledAt) {
      const dt = new Date(parsed.data.scheduledAt);
      if (Number.isNaN(dt.getTime())) {
        return res.status(400).json({ error: 'Invalid rescheduled date/time' });
      }
      updateSet.scheduledAt = dt;
    }

    const existingRows = await runQuery('orgs.findInterviewBeforeUpdate', () =>
      db
        .select({
          interview: interviews,
          applicantId: jobApplications.applicantId,
          jobTitle: jobs.title,
          jobId: jobs.id,
        })
        .from(interviews)
        .innerJoin(jobApplications, eq(interviews.applicationId, jobApplications.id))
        .innerJoin(jobs, eq(jobApplications.jobId, jobs.id))
        .where(and(eq(interviews.id, interviewId), eq(interviews.organizationId, orgId)))
        .limit(1)
    );
    if (!existingRows[0]) {
      return res.status(404).json({ error: 'Interview not found' });
    }

    const updated = await runQuery('orgs.updateInterview', () =>
      db
        .update(interviews)
        .set(updateSet)
        .where(and(eq(interviews.id, interviewId), eq(interviews.organizationId, orgId)))
        .returning()
    );

    if (parsed.data.scheduledAt || parsed.data.status === 'cancelled') {
      const actionLabel =
        parsed.data.status === 'cancelled'
          ? `Your interview for ${existingRows[0].jobTitle} was cancelled.`
          : `Your interview for ${existingRows[0].jobTitle} was rescheduled to ${new Date(updated[0].scheduledAt).toLocaleString()}.`;
      await createNotification({
        userId: existingRows[0].applicantId,
        actorId: req.dbUser!.id,
        type: 'interview_updated',
        title: `Interview update: ${existingRows[0].jobTitle}`,
        body: actionLabel,
        linkTab: 'jobs',
        entityId: existingRows[0].jobId,
      });
    }

    res.json({ interview: updated[0] });
  }
);

// Advisory AI Recruitment Tools
router.post(
  '/:id/ai/job-draft',
  requireAuth,
  requireOrgRole(RECRUITING_ROLES),
  async (req: AuthRequest, res) => {
    const schema = z.object({
      title: z.string().min(2).max(160),
      department: z.string().max(120).default('General'),
      location: z.string().max(120).default('Mbabane'),
      country: z.string().max(120).default('Eswatini'),
      employmentType: z.string().max(60).default('full-time'),
      experienceLevel: z.string().max(60).default('mid'),
      notes: z.string().max(1000).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Job title required for AI draft' });
    }
    try {
      await enforceAiFairUse(req.dbUser!.id, 'recruiter_job_draft');
      const draft = await draftJobDescriptionWithGemini(parsed.data);
      res.json(draft);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'AI job draft failed';
      res.status(500).json({ error: msg });
    }
  }
);

router.post(
  '/:id/ai/match-candidate',
  requireAuth,
  requireOrgRole(INTERVIEW_FEEDBACK_ROLES),
  async (req: AuthRequest, res) => {
    const orgId = Number(req.params.id);
    const schema = z.object({
      applicationId: z.number().int().positive(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Valid applicationId required' });
    }

    const rows = await runQuery('orgs.loadAppForAiMatch', () =>
      db
        .select({
          job: jobs,
          profile: profiles,
          cvDoc: cvDocuments,
        })
        .from(jobApplications)
        .innerJoin(jobs, eq(jobApplications.jobId, jobs.id))
        .innerJoin(profiles, eq(profiles.userId, jobApplications.applicantId))
        .leftJoin(cvDocuments, eq(jobApplications.cvDocumentId, cvDocuments.id))
        .where(
          and(
            eq(jobApplications.id, parsed.data.applicationId),
            eq(jobs.organizationId, orgId)
          )
        )
        .limit(1)
    );
    if (!rows[0]) {
      return res.status(404).json({ error: 'Application not found' });
    }

    try {
      await enforceAiFairUse(req.dbUser!.id, 'recruiter_candidate_match');
      const result = await explainCandidateMatchWithGemini({
        jobTitle: rows[0].job.title,
        jobDescription: rows[0].job.description,
        jobRequirements: rows[0].job.requirements,
        candidateHeadline: rows[0].profile.headline,
        candidateSkills: rows[0].profile.skills || [],
        cvText: rows[0].cvDoc?.extractedText || '',
      });
      res.json(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'AI candidate match failed';
      res.status(500).json({ error: msg });
    }
  }
);

router.post(
  '/:id/ai/interview-questions',
  requireAuth,
  requireOrgRole(INTERVIEW_FEEDBACK_ROLES),
  async (req: AuthRequest, res) => {
    const orgId = Number(req.params.id);
    const schema = z.object({
      applicationId: z.number().int().positive(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Valid applicationId required' });
    }

    const rows = await runQuery('orgs.loadAppForAiQuestions', () =>
      db
        .select({
          job: jobs,
          profile: profiles,
        })
        .from(jobApplications)
        .innerJoin(jobs, eq(jobApplications.jobId, jobs.id))
        .innerJoin(profiles, eq(profiles.userId, jobApplications.applicantId))
        .where(
          and(
            eq(jobApplications.id, parsed.data.applicationId),
            eq(jobs.organizationId, orgId)
          )
        )
        .limit(1)
    );
    if (!rows[0]) {
      return res.status(404).json({ error: 'Application not found' });
    }

    try {
      await enforceAiFairUse(req.dbUser!.id, 'recruiter_interview_questions');
      const questions = await generateInterviewQuestionsWithGemini({
        targetRole: rows[0].job.title,
        experienceLevel: rows[0].job.experienceLevel,
        background: `Headline: ${rows[0].profile.headline}\nSkills: ${(rows[0].profile.skills || []).join(', ')}\nRequirements: ${rows[0].job.requirements}`,
      });
      res.json({ questions });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'AI interview question generator failed';
      res.status(500).json({ error: msg });
    }
  }
);

router.get(
  '/:id/analytics',
  requireAuth,
  requireOrgRole(['owner', 'admin', 'recruiter', 'hiring_manager']),
  async (req: AuthRequest, res) => {
    const orgId = Number(req.params.id);
    const range = typeof req.query.range === 'string' ? req.query.range : 'all';
    const filterJobId = req.query.jobId ? Number(req.query.jobId) : null;
    const filterDepartment =
      typeof req.query.department === 'string' ? req.query.department.trim() : '';

    let sinceDate: Date | null = null;
    if (range === '7d') sinceDate = new Date(Date.now() - 7 * 86400_000);
    else if (range === '30d') sinceDate = new Date(Date.now() - 30 * 86400_000);
    else if (range === '90d') sinceDate = new Date(Date.now() - 90 * 86400_000);

    const [orgJobs, orgApps, orgInterviews, publicTalent] = await Promise.all([
      runQuery('orgs.analyticsJobs', () =>
        db.select().from(jobs).where(eq(jobs.organizationId, orgId))
      ),
      runQuery('orgs.analyticsApps', () =>
        db
          .select({
            id: jobApplications.id,
            jobId: jobApplications.jobId,
            stage: jobApplications.stage,
            createdAt: jobApplications.createdAt,
          })
          .from(jobApplications)
          .innerJoin(jobs, eq(jobApplications.jobId, jobs.id))
          .where(eq(jobs.organizationId, orgId))
      ),
      runQuery('orgs.analyticsInterviews', () =>
        db.select().from(interviews).where(eq(interviews.organizationId, orgId))
      ),
      runQuery('orgs.suggestedTalent', () =>
        db
          .select({
            userId: users.id,
            fullName: users.fullName,
            headline: profiles.headline,
            location: profiles.location,
            country: profiles.country,
            skills: profiles.skills,
            openToWork: profiles.openToWork,
          })
          .from(profiles)
          .innerJoin(users, eq(profiles.userId, users.id))
          .where(
            and(
              eq(users.status, 'active'),
              eq(profiles.visibility, 'public'),
              eq(profiles.openToWork, true)
            )
          )
          .limit(6)
      ),
    ]);

    const matchingJobs = orgJobs.filter((j) => {
      if (filterJobId && j.id !== filterJobId) return false;
      if (filterDepartment && j.department !== filterDepartment) return false;
      return true;
    });
    const matchingJobIds = new Set(matchingJobs.map((j) => j.id));

    const filteredApps = orgApps.filter((a) => {
      if (!matchingJobIds.has(a.jobId)) return false;
      if (sinceDate && new Date(a.createdAt) < sinceDate) return false;
      return true;
    });

    const filteredAppIds = new Set(filteredApps.map((a) => a.id));
    const filteredInterviews = orgInterviews.filter((iv) => {
      if ((filterJobId || filterDepartment) && !filteredAppIds.has(iv.applicationId)) return false;
      if (sinceDate && new Date(iv.createdAt) < sinceDate) return false;
      return true;
    });

    const byStage: Record<string, number> = {};
    for (const a of filteredApps) {
      byStage[a.stage] = (byStage[a.stage] ?? 0) + 1;
    }

    const byDepartmentMap = new Map<string, { department: string; jobs: number; applicants: number }>();
    for (const j of matchingJobs) {
      const dept = j.department || 'General';
      const entry = byDepartmentMap.get(dept) || { department: dept, jobs: 0, applicants: 0 };
      entry.jobs += 1;
      byDepartmentMap.set(dept, entry);
    }
    const jobDeptLookup = new Map(matchingJobs.map((j) => [j.id, j.department || 'General']));
    for (const a of filteredApps) {
      const dept = jobDeptLookup.get(a.jobId) || 'General';
      const entry = byDepartmentMap.get(dept);
      if (entry) entry.applicants += 1;
    }

    const appsByJobMap = new Map<number, { total: number; shortlisted: number; hired: number }>();
    for (const a of filteredApps) {
      const cur = appsByJobMap.get(a.jobId) || { total: 0, shortlisted: 0, hired: 0 };
      cur.total += 1;
      if (['shortlisted', 'interview', 'offer', 'hired'].includes(a.stage)) cur.shortlisted += 1;
      if (a.stage === 'hired') cur.hired += 1;
      appsByJobMap.set(a.jobId, cur);
    }

    const now = new Date();
    const upcomingInterviews = filteredInterviews.filter(
      (i) => i.status === 'scheduled' && new Date(i.scheduledAt) >= now
    ).length;
    const completedInterviews = filteredInterviews.filter((i) => i.status === 'completed').length;

    const totalAppsCount = filteredApps.length;
    const progressedCount = filteredApps.filter((a) =>
      ['shortlisted', 'interview', 'offer', 'hired'].includes(a.stage)
    ).length;
    const interviewedCount = filteredApps.filter((a) =>
      ['interview', 'offer', 'hired'].includes(a.stage)
    ).length;
    const hiredCount = byStage.hired || 0;

    const recentEvents = await runQuery('orgs.recentAudit', () =>
      db
        .select()
        .from(auditEvents)
        .where(
          or(
            and(eq(auditEvents.targetType, 'organization'), eq(auditEvents.targetId, orgId)),
            eq(auditEvents.action, 'job.created'),
            eq(auditEvents.action, 'application.stage_updated'),
            eq(auditEvents.action, 'interview.scheduled'),
            eq(auditEvents.action, 'talent.invited_to_apply')
          )
        )
        .orderBy(desc(auditEvents.createdAt))
        .limit(15)
    );

    res.json({
      totalJobs: matchingJobs.length,
      publishedJobs: matchingJobs.filter((j) => j.status === 'published').length,
      totalApplications: totalAppsCount,
      upcomingInterviews,
      completedInterviews,
      byStage,
      byDepartment: Array.from(byDepartmentMap.values()),
      byJob: matchingJobs.map((j) => ({
        id: j.id,
        title: j.title,
        department: j.department,
        status: j.status,
        totalApplicants: appsByJobMap.get(j.id)?.total ?? 0,
        shortlistedCount: appsByJobMap.get(j.id)?.shortlisted ?? 0,
        hiredCount: appsByJobMap.get(j.id)?.hired ?? 0,
      })),
      conversionRates: {
        shortlistRate: totalAppsCount > 0 ? Math.round((progressedCount / totalAppsCount) * 100) : 0,
        interviewRate: totalAppsCount > 0 ? Math.round((interviewedCount / totalAppsCount) * 100) : 0,
        hireRate: totalAppsCount > 0 ? Math.round((hiredCount / totalAppsCount) * 100) : 0,
      },
      suggestedCandidates: publicTalent,
      recentActivity: recentEvents.filter(
        (ev) =>
          (ev.targetType === 'organization' && ev.targetId === orgId) ||
          Number((ev.metadata as Record<string, unknown>)?.organizationId) === orgId
      ),
    });
  }
);

export { getUserOrgMembership };
export default router;
