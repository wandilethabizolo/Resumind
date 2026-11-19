import { Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { and, eq } from 'drizzle-orm';
import { adminAuth } from '../lib/firebase-admin.ts';
import { db, runQuery } from '../db/index.ts';
import { conversationMembers, users } from '../db/schema.ts';

let ioInstance: SocketIOServer | null = null;

export function initializeSocketServer(httpServer: HttpServer, allowedOrigins: string[]) {
  ioInstance = new SocketIOServer(httpServer, {
    destroyUpgrade: false,
    cors: {
      origin: allowedOrigins.length ? allowedOrigins : true,
      credentials: true,
    },
  });

  ioInstance.use(async (socket, next) => {
    try {
      const token =
        (socket.handshake.auth?.token as string | undefined) ||
        (socket.handshake.headers.authorization?.replace('Bearer ', '') ?? '');

      if (!token) {
        return next(new Error('Authentication token required'));
      }

      const decoded = await adminAuth.verifyIdToken(token);
      const userRows = await runQuery('socket.findUser', () =>
        db.select().from(users).where(eq(users.uid, decoded.uid)).limit(1)
      );
      if (!userRows[0] || userRows[0].status === 'suspended') {
        return next(new Error('Account unavailable'));
      }

      socket.data.userId = userRows[0].id;
      socket.data.uid = decoded.uid;
      next();
    } catch (err) {
      console.error('Socket auth error:', err);
      next(new Error('Invalid authentication token'));
    }
  });

  ioInstance.on('connection', (socket) => {
    const userId = socket.data.userId as number;
    socket.join(`user:${userId}`);

    socket.on('conversation:join', async (conversationId: number, ack?: (ok: boolean) => void) => {
      if (!Number.isInteger(conversationId) || conversationId <= 0) {
        ack?.(false);
        return;
      }
      const member = await runQuery('socket.verifyConvMember', () =>
        db
          .select()
          .from(conversationMembers)
          .where(
            and(
              eq(conversationMembers.conversationId, conversationId),
              eq(conversationMembers.userId, userId)
            )
          )
          .limit(1)
      );
      if (!member[0]) {
        ack?.(false);
        return;
      }
      socket.join(`conversation:${conversationId}`);
      ack?.(true);
    });

    socket.on('conversation:leave', (conversationId: number) => {
      if (Number.isInteger(conversationId) && conversationId > 0) {
        socket.leave(`conversation:${conversationId}`);
      }
    });

    socket.on(
      'conversation:typing',
      (payload: { conversationId?: number; isTyping?: boolean }) => {
        const conversationId = Number(payload?.conversationId);
        if (!Number.isInteger(conversationId) || conversationId <= 0) return;
        const room = `conversation:${conversationId}`;
        if (!socket.rooms.has(room)) return;
        socket.to(room).emit('conversation:typing', {
          conversationId,
          userId,
          isTyping: Boolean(payload?.isTyping),
        });
      }
    );
  });

  return ioInstance;
}

export function emitToUser(userId: number, event: string, payload: unknown) {
  ioInstance?.to(`user:${userId}`).emit(event, payload);
}

export function emitToConversation(conversationId: number, event: string, payload: unknown) {
  ioInstance?.to(`conversation:${conversationId}`).emit(event, payload);
}

export function emitToAll(event: string, payload: unknown) {
  ioInstance?.emit(event, payload);
}
