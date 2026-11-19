import React, { useCallback, useEffect, useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { AppTab } from '../types';

interface NotificationRow {
  id: number;
  type: string;
  title: string;
  body: string;
  linkTab: AppTab;
  read: boolean;
  createdAt: string;
}

interface NotificationsViewProps {
  onNavigate: (tab: AppTab) => void;
}

export const NotificationsView: React.FC<NotificationsViewProps> = ({ onNavigate }) => {
  const { apiFetch, socket, setUnreadNotifications } = useAuth();
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ notifications: NotificationRow[] }>('/api/notifications');
      const list = data.notifications || [];
      setItems(list);
      setUnreadNotifications(list.filter((n) => !n.read).length);
    } finally {
      setLoading(false);
    }
  }, [apiFetch, setUnreadNotifications]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!socket) return;
    const onNewNotification = (incoming: NotificationRow) => {
      if (!incoming?.id) return;
      setItems((prev) => {
        if (prev.some((n) => n.id === incoming.id)) return prev;
        return [incoming, ...prev];
      });
    };
    socket.on('notification:new', onNewNotification);
    return () => {
      socket.off('notification:new', onNewNotification);
    };
  }, [socket]);

  const markRead = async (n: NotificationRow) => {
    if (!n.read) {
      await apiFetch(`/api/notifications/${n.id}/read`, { method: 'POST' });
      setItems((prev) => prev.map((row) => (row.id === n.id ? { ...row, read: true } : row)));
      setUnreadNotifications((c) => Math.max(0, c - 1));
    }
    if (n.linkTab) {
      onNavigate(n.linkTab);
    }
  };

  const markAllRead = async () => {
    await apiFetch('/api/notifications/read-all', { method: 'POST' });
    setItems((prev) => prev.map((row) => ({ ...row, read: true })));
    setUnreadNotifications(0);
  };

  const unreadCount = items.filter((n) => !n.read).length;
  const displayedItems = filter === 'unread' ? items.filter((n) => !n.read) : items;

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Alerts</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Invitations, reactions, comments, likes, messages, and application updates.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                filter === 'all'
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
              }`}
            >
              All <span className="ml-1 font-mono tabular-nums opacity-75">{items.length}</span>
            </button>
            <button
              type="button"
              onClick={() => setFilter('unread')}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                filter === 'unread'
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
              }`}
            >
              Unread{' '}
              <span className="ml-1 font-mono tabular-nums opacity-75">{unreadCount}</span>
            </button>
          </div>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark All Read
            </button>
          )}
        </div>
      </div>

      <div className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
        {loading ? (
          <p className="p-6 text-xs text-slate-500">Loading alerts...</p>
        ) : displayedItems.length === 0 ? (
          <div className="flex flex-col items-center p-10 text-center text-slate-500">
            <Bell className="h-6 w-6 text-slate-400" />
            <p className="mt-2 text-sm">
              {filter === 'unread' ? 'No unread alerts right now.' : 'You are all caught up.'}
            </p>
          </div>
        ) : (
          displayedItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => markRead(item)}
              className={`flex w-full items-start justify-between gap-4 p-4 text-left transition-colors ${
                item.read
                  ? 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  : 'bg-emerald-50/50 hover:bg-emerald-50 dark:bg-slate-800/60'
              }`}
            >
              <div className="flex items-start gap-2.5">
                {!item.read && (
                  <span
                    className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#0F5C4D] dark:bg-emerald-400"
                    aria-hidden="true"
                  />
                )}
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">{item.title}</p>
                  {item.body && (
                    <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">{item.body}</p>
                  )}
                </div>
              </div>
              <span className="shrink-0 font-mono text-xs text-slate-400 tabular-nums">
                {new Date(item.createdAt).toLocaleDateString()}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
};
