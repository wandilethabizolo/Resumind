import { Router } from 'express';
import { and, desc, eq, ilike, or } from 'drizzle-orm';
import { z } from 'zod';
import { db, runQuery } from '../../db/index.ts';
import {
  cvDocuments,
  jobApplications,
  jobs,
  organizationMembers,
  organizations,
  profiles,
  users,
} from '../../db/schema.ts';
import {
  AuthRequest,
  getUserOrgMembership,
  requireAuth,
  requireOrgRole,
} from '../middleware/auth.ts';
import { getClientIp, recordAuditEvent } from '../services/audit.ts';
import { createNotification } from '../services/notifications.ts';

const router = Router();

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
    return res.status(400).json({ error: 'Invalid organization data', details: parsed.error.flatten() });
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

router.patch('/:id', requireAuth, requireOrgRole(['owner', 'admin']), async (req: AuthRequest, res) => {
  const orgId = Number(req.params.id);
  const schema = z.object({
    name: z.string().min(2).max(160).optional(),
    industry: z.string().max(120).optional(),
    location: z.string().max(120).optional(),
    country: z.string().max(120).optional(),
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
  res.json({ organization: updated[0] });
});

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
  requireOrgRole(['owner', 'admin', 'recruiter', 'viewer']),
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
          and(eq(organizationMembers.organizationId, orgId), eq(organizationMembers.status, 'active'))
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
      role: z.enum(['admin', 'recruiter', 'viewer']),
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
      title: `You were added as ${parsed.data.role} to an organization workspace`,
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
    res.json({ removed: true });
  }
);

router.get(
  '/:id/jobs',
  requireAuth,
  requireOrgRole(['owner', 'admin', 'recruiter', 'viewer']),
  async (req: AuthRequest, res) => {
    const orgId = Number(req.params.id);
    const rows = await runQuery('orgs.jobs', () =>
      db
        .select()
        .from(jobs)
        .where(eq(jobs.organizationId, orgId))
        .orderBy(desc(jobs.createdAt))
    );
    res.json({ jobs: rows });
  }
);

router.post(
  '/:id/jobs',
  requireAuth,
  requireOrgRole(['owner', 'admin', 'recruiter']),
  async (req: AuthRequest, res) => {
    const orgId = Number(req.params.id);
    const schema = z.object({
      title: z.string().min(2).max(160),
      description: z.string().min(10).max(8000),
      requirements: z.string().max(4000).default(''),
      location: z.string().min(2).max(120),
      country: z.string().min(2).max(120).default('Eswatini'),
      workArrangement: z.enum(['remote', 'hybrid', 'onsite']).default('hybrid'),
      employmentType: z.enum(['full-time', 'part-time', 'contract', 'internship']).default('full-time'),
      experienceLevel: z.enum(['entry', 'mid', 'senior', 'executive']).default('mid'),
      salaryRange: z.string().max(120).default(''),
      status: z.enum(['draft', 'published']).default('published'),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid job vacancy payload', details: parsed.error.flatten() });
    }

    const orgRows = await runQuery('orgs.checkStatusForJob', () =>
      db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1)
    );
    if (!orgRows[0] || orgRows[0].status === 'suspended') {
      return res.status(403).json({ error: 'Organization is suspended' });
    }

    const inserted = await runQuery('orgs.createJob', () =>
      db
        .insert(jobs)
        .values({
          organizationId: orgId,
          postedById: req.dbUser!.id,
          ...parsed.data,
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

    res.status(201).json({ job: inserted[0] });
  }
);

router.patch(
  '/:id/jobs/:jobId',
  requireAuth,
  requireOrgRole(['owner', 'admin', 'recruiter']),
  async (req: AuthRequest, res) => {
    const orgId = Number(req.params.id);
    const jobId = Number(req.params.jobId);
    const schema = z.object({
      title: z.string().min(2).max(160).optional(),
      description: z.string().min(10).max(8000).optional(),
      requirements: z.string().max(4000).optional(),
      location: z.string().max(120).optional(),
      country: z.string().max(120).optional(),
      workArrangement: z.enum(['remote', 'hybrid', 'onsite']).optional(),
      employmentType: z.enum(['full-time', 'part-time', 'contract', 'internship']).optional(),
      experienceLevel: z.enum(['entry', 'mid', 'senior', 'executive']).optional(),
      salaryRange: z.string().max(120).optional(),
      status: z.enum(['draft', 'published', 'closed']).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid job update' });
    }

    const updated = await runQuery('orgs.updateJob', () =>
      db
        .update(jobs)
        .set({ ...parsed.data, updatedAt: new Date() })
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
  requireOrgRole(['owner', 'admin', 'recruiter', 'viewer']),
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

    res.json({
      applications: rows.map((r) => ({
        ...r.application,
        jobTitle: r.job.title,
        applicant: r.applicant,
        profile: r.profile,
        cvDocument: r.cvDocument?.id ? r.cvDocument : null,
      })),
    });
  }
);

router.patch(
  '/:id/applications/:appId/stage',
  requireAuth,
  requireOrgRole(['owner', 'admin', 'recruiter']),
  async (req: AuthRequest, res) => {
    const orgId = Number(req.params.id);
    const appId = Number(req.params.appId);
    const schema = z.object({
      stage: z.enum(['submitted', 'screening', 'interview', 'offer', 'rejected']),
      employerNotes: z.string().max(3000).optional(),
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

    await createNotification({
      userId: appRows[0].application.applicantId,
      actorId: req.dbUser!.id,
      type: 'application_stage',
      title: `Application update: ${appRows[0].job.title}`,
      body: `Your application moved to "${parsed.data.stage}" stage.`,
      linkTab: 'jobs',
      entityId: appRows[0].job.id,
    });

    await recordAuditEvent({
      actorId: req.dbUser!.id,
      action: 'application.stage_updated',
      targetType: 'job_application',
      targetId: appId,
      metadata: { organizationId: orgId, stage: parsed.data.stage },
      ipAddress: getClientIp(req),
    });

    res.json({ application: updated[0] });
  }
);

router.get(
  '/:id/analytics',
  requireAuth,
  requireOrgRole(['owner', 'admin', 'recruiter', 'viewer']),
  async (req: AuthRequest, res) => {
    const orgId = Number(req.params.id);
    const orgJobs = await runQuery('orgs.analyticsJobs', () =>
      db.select().from(jobs).where(eq(jobs.organizationId, orgId))
    );
    const orgApps = await runQuery('orgs.analyticsApps', () =>
      db
        .select({ stage: jobApplications.stage })
        .from(jobApplications)
        .innerJoin(jobs, eq(jobApplications.jobId, jobs.id))
        .where(eq(jobs.organizationId, orgId))
    );

    const byStage: Record<string, number> = {};
    for (const a of orgApps) {
      byStage[a.stage] = (byStage[a.stage] ?? 0) + 1;
    }

    res.json({
      totalJobs: orgJobs.length,
      publishedJobs: orgJobs.filter((j) => j.status === 'published').length,
      totalApplications: orgApps.length,
      byStage,
    });
  }
);

export { getUserOrgMembership };
export default router;
