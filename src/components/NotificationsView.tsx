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
  const { apiFetch, setUnreadNotifications } = useAuth();
  const [items, setItems] = useState<NotificationRow[]>([]);
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

  const markRead = async (n: NotificationRow) => {
    if (!n.read) {
      await apiFetch(`/api/notifications/${n.id}/read`, { method: 'POST' });
      await load();
    }
    if (n.linkTab) {
      onNavigate(n.linkTab);
    }
  };

  const markAllRead = async () => {
    await apiFetch('/api/notifications/read-all', { method: 'POST' });
    await load();
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
      <div className="flex items-center justify-between border-b border-slate-200 pb-4 dark:border-slate-800">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Notifications</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Invitations, reactions, comments, messages, and application updates.
          </p>
        </div>
        <button
          type="button"
          onClick={markAllRead}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
        >
          <CheckCheck className="h-3.5 w-3.5" />
          Mark All Read
        </button>
      </div>

      <div className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
        {loading ? (
          <p className="p-6 text-xs text-slate-500">Loading notifications...</p>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center p-10 text-center text-slate-500">
            <Bell className="h-6 w-6 text-slate-400" />
            <p className="mt-2 text-sm">You are all caught up.</p>
          </div>
        ) : (
          items.map((item) => (
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
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-white">{item.title}</p>
                {item.body && (
                  <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">{item.body}</p>
                )}
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
