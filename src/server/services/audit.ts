import { Request } from 'express';
import { db, runQuery } from '../../db/index.ts';
import { auditEvents } from '../../db/schema.ts';

export function getClientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) {
    return fwd.split(',')[0].trim();
  }
  return req.ip || 'unknown';
}

export async function recordAuditEvent(params: {
  actorId: number | null;
  action: string;
  targetType?: string;
  targetId?: number | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}) {
  try {
    await runQuery('audit.insert', () =>
      db.insert(auditEvents).values({
        actorId: params.actorId,
        action: params.action,
        targetType: params.targetType ?? 'system',
        targetId: params.targetId ?? null,
        metadata: params.metadata ?? {},
        ipAddress: params.ipAddress ?? '',
      })
    );
  } catch (err) {
    console.error('Audit log insert failed:', err);
  }
}
