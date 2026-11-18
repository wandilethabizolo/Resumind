import { db, runQuery } from '../../db/index.ts';
import { notifications } from '../../db/schema.ts';
import { emitToUser } from '../socket.ts';

export async function createNotification(params: {
  userId: number;
  actorId?: number | null;
  type: string;
  title: string;
  body?: string;
  linkTab?: string;
  entityId?: number | null;
}) {
  if (params.actorId && params.actorId === params.userId) return;

  const inserted = await runQuery('notifications.create', () =>
    db
      .insert(notifications)
      .values({
        userId: params.userId,
        actorId: params.actorId ?? null,
        type: params.type,
        title: params.title,
        body: params.body ?? '',
        linkTab: params.linkTab ?? 'home',
        entityId: params.entityId ?? null,
      })
      .returning()
  );

  if (inserted[0]) {
    emitToUser(params.userId, 'notification:new', inserted[0]);
  }
}
