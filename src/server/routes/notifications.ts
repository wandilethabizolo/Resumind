import { Router } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { db, runQuery } from '../../db/index.ts';
import { notifications } from '../../db/schema.ts';
import { AuthRequest, requireAuth } from '../middleware/auth.ts';

const router = Router();

router.get('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const rows = await runQuery('notifications.list', () =>
      db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, req.dbUser!.id))
        .orderBy(desc(notifications.createdAt))
        .limit(60)
    );
    res.json({ notifications: rows });
  } catch {
    res.status(500).json({ error: 'Failed to load notifications' });
  }
});

router.post('/:id/read', requireAuth, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid notification ID' });
  }
  await runQuery('notifications.markOne', () =>
    db
      .update(notifications)
      .set({ read: true })
      .where(and(eq(notifications.id, id), eq(notifications.userId, req.dbUser!.id)))
  );
  res.json({ read: true });
});

router.post('/read-all', requireAuth, async (req: AuthRequest, res) => {
  await runQuery('notifications.markAll', () =>
    db
      .update(notifications)
      .set({ read: true })
      .where(eq(notifications.userId, req.dbUser!.id))
  );
  res.json({ readAll: true });
});

export default router;
