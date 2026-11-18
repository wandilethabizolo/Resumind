import { Router } from 'express';
import { z } from 'zod';
import { db, runQuery } from '../../db/index.ts';
import { reports } from '../../db/schema.ts';
import { AuthRequest, requireAuth } from '../middleware/auth.ts';
import { getClientIp, recordAuditEvent } from '../services/audit.ts';

const router = Router();

router.post('/', requireAuth, async (req: AuthRequest, res) => {
  const schema = z.object({
    targetType: z.enum(['post', 'comment', 'user', 'job', 'organization', 'message']),
    targetId: z.number().int().positive(),
    reason: z.string().min(3).max(200),
    details: z.string().max(2000).default(''),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid report submission' });
  }

  const [created] = await runQuery('reports.create', () =>
    db
      .insert(reports)
      .values({
        reporterId: req.dbUser!.id,
        ...parsed.data,
      })
      .returning()
  );

  await recordAuditEvent({
    actorId: req.dbUser!.id,
    action: 'report.submitted',
    targetType: parsed.data.targetType,
    targetId: parsed.data.targetId,
    metadata: { reportId: created.id, reason: parsed.data.reason },
    ipAddress: getClientIp(req),
  });

  res.status(201).json({ report: created });
});

export default router;
