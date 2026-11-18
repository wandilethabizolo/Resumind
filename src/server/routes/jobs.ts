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
  savedJobs,
} from '../../db/schema.ts';
import { AuthRequest, optionalAuth, requireAuth } from '../middleware/auth.ts';
import { createNotification } from '../services/notifications.ts';

const router = Router();

router.get('/', optionalAuth, async (req: AuthRequest, res) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const country = typeof req.query.country === 'string' ? req.query.country.trim() : '';
    const location = typeof req.query.location === 'string' ? req.query.location.trim() : '';
    const workArrangement =
      typeof req.query.workArrangement === 'string' ? req.query.workArrangement.trim() : '';
    const employmentType =
      typeof req.query.employmentType === 'string' ? req.query.employmentType.trim() : '';
    const experienceLevel =
      typeof req.query.experienceLevel === 'string' ? req.query.experienceLevel.trim() : '';

    const rows = await runQuery('jobs.list', () =>
      db
        .select({
          job: jobs,
          organization: {
            id: organizations.id,
            name: organizations.name,
            slug: organizations.slug,
            industry: organizations.industry,
            verified: organizations.verified,
            location: organizations.location,
            country: organizations.country,
          },
        })
        .from(jobs)
        .innerJoin(organizations, eq(jobs.organizationId, organizations.id))
        .where(
          and(
            eq(jobs.status, 'published'),
            eq(organizations.status, 'active'),
            country ? eq(jobs.country, country) : undefined,
            location ? ilike(jobs.location, `%${location}%`) : undefined,
            workArrangement ? eq(jobs.workArrangement, workArrangement) : undefined,
            employmentType ? eq(jobs.employmentType, employmentType) : undefined,
            experienceLevel ? eq(jobs.experienceLevel, experienceLevel) : undefined,
            q
              ? or(
                  ilike(jobs.title, `%${q}%`),
                  ilike(jobs.description, `%${q}%`),
                  ilike(jobs.requirements, `%${q}%`),
                  ilike(organizations.name, `%${q}%`)
                )
              : undefined
          )
        )
        .orderBy(desc(jobs.createdAt))
        .limit(60)
    );

    let savedSet = new Set<number>();
    let appliedMap = new Map<number, string>();
    if (req.dbUser) {
      const [sRows, aRows] = await Promise.all([
        runQuery('jobs.savedUser', () =>
          db.select().from(savedJobs).where(eq(savedJobs.userId, req.dbUser!.id))
        ),
        runQuery('jobs.appliedUser', () =>
          db.select().from(jobApplications).where(eq(jobApplications.applicantId, req.dbUser!.id))
        ),
      ]);
      savedSet = new Set(sRows.map((s) => s.jobId));
      appliedMap = new Map(aRows.map((a) => [a.jobId, a.stage]));
    }

    res.json({
      jobs: rows.map((r) => ({
        ...r.job,
        organization: r.organization,
        isSaved: savedSet.has(r.job.id),
        applicationStage: appliedMap.get(r.job.id) ?? null,
      })),
    });
  } catch {
    res.status(500).json({ error: 'Failed to load jobs' });
  }
});

router.get('/applications/me', requireAuth, async (req: AuthRequest, res) => {
  try {
    const rows = await runQuery('jobs.myApplications', () =>
      db
        .select({
          application: jobApplications,
          job: jobs,
          organization: {
            id: organizations.id,
            name: organizations.name,
            verified: organizations.verified,
            location: organizations.location,
            country: organizations.country,
          },
        })
        .from(jobApplications)
        .innerJoin(jobs, eq(jobApplications.jobId, jobs.id))
        .innerJoin(organizations, eq(jobs.organizationId, organizations.id))
        .where(eq(jobApplications.applicantId, req.dbUser!.id))
        .orderBy(desc(jobApplications.updatedAt))
    );

    res.json({
      applications: rows.map((r) => ({
        ...r.application,
        job: r.job,
        organization: r.organization,
      })),
    });
  } catch {
    res.status(500).json({ error: 'Failed to load your job applications' });
  }
});

router.post('/:id/save', requireAuth, async (req: AuthRequest, res) => {
  const jobId = Number(req.params.id);
  const userId = req.dbUser!.id;
  if (!Number.isInteger(jobId) || jobId <= 0) {
    return res.status(400).json({ error: 'Invalid job ID' });
  }

  const existing = await runQuery('jobs.checkSaved', () =>
    db
      .select()
      .from(savedJobs)
      .where(and(eq(savedJobs.jobId, jobId), eq(savedJobs.userId, userId)))
      .limit(1)
  );
  if (existing[0]) {
    await runQuery('jobs.unsave', () =>
      db.delete(savedJobs).where(eq(savedJobs.id, existing[0].id))
    );
    return res.json({ saved: false });
  }
  await runQuery('jobs.save', () => db.insert(savedJobs).values({ jobId, userId }));
  res.json({ saved: true });
});

router.post('/:id/apply', requireAuth, async (req: AuthRequest, res) => {
  const jobId = Number(req.params.id);
  const schema = z.object({
    cvDocumentId: z.number().int().positive().optional().nullable(),
    coverLetter: z.string().max(5000).default(''),
  });
  const parsed = schema.safeParse(req.body);
  if (!Number.isInteger(jobId) || jobId <= 0 || !parsed.success) {
    return res.status(400).json({ error: 'Invalid job application payload' });
  }

  const userId = req.dbUser!.id;
  const jobRows = await runQuery('jobs.findForApply', () =>
    db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1)
  );
  if (!jobRows[0] || jobRows[0].status !== 'published') {
    return res.status(404).json({ error: 'Job vacancy is not open for applications' });
  }

  if (parsed.data.cvDocumentId) {
    const cvRows = await runQuery('jobs.verifyCvOwner', () =>
      db
        .select()
        .from(cvDocuments)
        .where(and(eq(cvDocuments.id, parsed.data.cvDocumentId!), eq(cvDocuments.userId, userId)))
        .limit(1)
    );
    if (!cvRows[0]) {
      return res.status(403).json({ error: 'Selected CV document does not belong to you' });
    }
  }

  const existingApp = await runQuery('jobs.checkDuplicateApp', () =>
    db
      .select()
      .from(jobApplications)
      .where(and(eq(jobApplications.jobId, jobId), eq(jobApplications.applicantId, userId)))
      .limit(1)
  );
  if (existingApp[0]) {
    if (existingApp[0].stage === 'withdrawn') {
      const reopened = await runQuery('jobs.reapply', () =>
        db
          .update(jobApplications)
          .set({
            stage: 'submitted',
            cvDocumentId: parsed.data.cvDocumentId ?? null,
            coverLetter: parsed.data.coverLetter.trim(),
            updatedAt: new Date(),
          })
          .where(eq(jobApplications.id, existingApp[0].id))
          .returning()
      );
      return res.status(201).json({ application: reopened[0] });
    }
    return res.status(409).json({ error: 'You have already applied for this vacancy' });
  }

  const inserted = await runQuery('jobs.createApplication', () =>
    db
      .insert(jobApplications)
      .values({
        jobId,
        applicantId: userId,
        cvDocumentId: parsed.data.cvDocumentId ?? null,
        coverLetter: parsed.data.coverLetter.trim(),
        stage: 'submitted',
      })
      .returning()
  );

  // Notify organization recruiters/owners
  const orgStaff = await runQuery('jobs.orgStaff', () =>
    db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, jobRows[0].organizationId),
          eq(organizationMembers.status, 'active')
        )
      )
  );
  for (const member of orgStaff) {
    if (['owner', 'admin', 'recruiter'].includes(member.role)) {
      await createNotification({
        userId: member.userId,
        actorId: userId,
        type: 'job_application',
        title: `New application for ${jobRows[0].title}`,
        body: `${req.dbUser!.fullName} submitted an application.`,
        linkTab: 'employers',
        entityId: jobId,
      });
    }
  }

  res.status(201).json({ application: inserted[0] });
});

router.post('/applications/:appId/withdraw', requireAuth, async (req: AuthRequest, res) => {
  const appId = Number(req.params.appId);
  if (!Number.isInteger(appId) || appId <= 0) {
    return res.status(400).json({ error: 'Invalid application ID' });
  }

  const rows = await runQuery('jobs.findAppWithdraw', () =>
    db.select().from(jobApplications).where(eq(jobApplications.id, appId)).limit(1)
  );
  if (!rows[0] || rows[0].applicantId !== req.dbUser!.id) {
    return res.status(404).json({ error: 'Application not found' });
  }
  if (['offer', 'rejected', 'withdrawn'].includes(rows[0].stage)) {
    return res.status(400).json({ error: `Cannot withdraw application in '${rows[0].stage}' stage` });
  }

  const updated = await runQuery('jobs.withdrawApp', () =>
    db
      .update(jobApplications)
      .set({ stage: 'withdrawn', updatedAt: new Date() })
      .where(eq(jobApplications.id, appId))
      .returning()
  );
  res.json({ application: updated[0] });
});

export default router;
