import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Ban, Check, Flag, Send } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ReportModal } from './ReportModal';

interface ConversationRow {
  id: number;
  isRequest: boolean;
  unreadCount: number;
  updatedAt: string;
  peer: {
    userId: number;
    fullName: string;
    headline: string;
    avatarUrl: string;
    lastReadAt: string;
  } | null;
  lastMessage: {
    id: number;
    content: string;
    senderId: number;
    createdAt: string;
  } | null;
}

interface ChatMessage {
  id: number;
  conversationId: number;
  senderId: number;
  content: string;
  createdAt: string;
}

interface MessagesViewProps {
  initialRecipientId?: number | null;
  onClearInitialRecipient?: () => void;
}

export const MessagesView: React.FC<MessagesViewProps> = ({
  initialRecipientId,
  onClearInitialRecipient,
}) => {
  const { user, socket, apiFetch } = useAuth();
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [filterTab, setFilterTab] = useState<'inbox' | 'requests'>('inbox');
  const [reportUserId, setReportUserId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const endRef = useRef<HTMLDivElement | null>(null);

  const loadConversations = useCallback(async () => {
    const data = await apiFetch<{ conversations: ConversationRow[] }>('/api/conversations');
    const list = data.conversations || [];
    setConversations(list);
    if (!activeId && list.length > 0) {
      setActiveId(list[0].id);
    }
  }, [activeId, apiFetch]);

  const loadMessages = useCallback(
    async (convId: number) => {
      const data = await apiFetch<{ messages: ChatMessage[] }>(
        `/api/conversations/${convId}/messages`
      );
      setMessages(data.messages || []);
    },
    [apiFetch]
  );

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (!initialRecipientId) return;
    apiFetch<{ conversationId: number }>('/api/conversations', {
      method: 'POST',
      body: JSON.stringify({ recipientId: initialRecipientId }),
    })
      .then((res) => {
        setActiveId(res.conversationId);
        loadConversations();
        onClearInitialRecipient?.();
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Unable to start conversation');
      });
  }, [apiFetch, initialRecipientId, loadConversations, onClearInitialRecipient]);

  useEffect(() => {
    if (!activeId) return;
    loadMessages(activeId);

    if (socket) {
      socket.emit('conversation:join', activeId);
      const handleNew = (msg: ChatMessage) => {
        if (msg.conversationId === activeId) {
          setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
        }
        loadConversations();
      };
      socket.on('message:new', handleNew);
      return () => {
        socket.emit('conversation:leave', activeId);
        socket.off('message:new', handleNew);
      };
    }
  }, [activeId, loadConversations, loadMessages, socket]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const activeConv = conversations.find((c) => c.id === activeId) || null;
  const visibleConvs = conversations.filter((c) =>
    filterTab === 'requests' ? c.isRequest : !c.isRequest
  );

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeId || !draft.trim()) return;
    setSending(true);
    setError('');
    try {
      const res = await apiFetch<{ message: ChatMessage }>(
        `/api/conversations/${activeId}/messages`,
        {
          method: 'POST',
          body: JSON.stringify({ content: draft.trim() }),
        }
      );
      setDraft('');
      setMessages((prev) =>
        prev.some((m) => m.id === res.message.id) ? prev : [...prev, res.message]
      );
      await loadConversations();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to send message');
    } finally {
      setSending(false);
    }
  };

  const handleAcceptRequest = async (convId: number) => {
    await apiFetch(`/api/conversations/${convId}/accept`, { method: 'POST' });
    setFilterTab('inbox');
    await loadConversations();
  };

  const handleBlockPeer = async (peerId: number) => {
    await apiFetch(`/api/network/block/${peerId}`, { method: 'POST' });
    setActiveId(null);
    setMessages([]);
    await loadConversations();
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="grid min-h-[560px] grid-cols-1 overflow-hidden rounded-xl border border-slate-200 bg-white md:grid-cols-12 dark:border-slate-800 dark:bg-slate-900">
        {/* Conversation List */}
        <aside className="border-b border-slate-200 md:col-span-4 md:border-b-0 md:border-r dark:border-slate-800">
          <div className="flex items-center justify-between border-b border-slate-200 p-3 dark:border-slate-800">
            <h1 className="text-sm font-bold text-slate-900 dark:text-white">Messages</h1>
            <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => setFilterTab('inbox')}
                className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                  filterTab === 'inbox'
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                Inbox
              </button>
              <button
                type="button"
                onClick={() => setFilterTab('requests')}
                className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                  filterTab === 'requests'
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                Requests ({conversations.filter((c) => c.isRequest).length})
              </button>
            </div>
          </div>

          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {visibleConvs.length === 0 ? (
              <p className="p-6 text-xs text-slate-500">
                {filterTab === 'requests'
                  ? 'No pending message requests.'
                  : 'No conversations yet. Visit My Network to message a connection.'}
              </p>
            ) : (
              visibleConvs.map((conv) => (
                <button
                  key={conv.id}
                  type="button"
                  onClick={() => setActiveId(conv.id)}
                  className={`flex w-full items-start justify-between gap-2 p-3 text-left transition-colors ${
                    activeId === conv.id
                      ? 'bg-emerald-50/70 dark:bg-slate-800/80'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                      {conv.peer?.fullName || 'Conversation'}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {conv.lastMessage?.content || conv.peer?.headline}
                    </p>
                  </div>
                  {conv.unreadCount > 0 && (
                    <span className="font-mono text-xs font-semibold text-[#0F5C4D] tabular-nums dark:text-emerald-400">
                      {conv.unreadCount}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </aside>

        {/* Active Thread */}
        <section className="flex flex-col md:col-span-8">
          {activeConv ? (
            <>
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                    {activeConv.peer?.fullName}
                  </h2>
                  <p className="text-xs text-slate-500">{activeConv.peer?.headline}</p>
                </div>
                {activeConv.peer && (
                  <div className="flex items-center gap-2">
                    {activeConv.isRequest && (
                      <button
                        type="button"
                        onClick={() => handleAcceptRequest(activeConv.id)}
                        className="inline-flex items-center gap-1 rounded-lg bg-[#0F5C4D] px-2.5 py-1 text-xs font-medium text-white"
                      >
                        <Check className="h-3.5 w-3.5" />
                        Accept Request
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setReportUserId(activeConv.peer!.userId)}
                      className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:text-red-600 dark:border-slate-700"
                      title="Report user"
                    >
                      <Flag className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBlockPeer(activeConv.peer!.userId)}
                      className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:text-red-600 dark:border-slate-700"
                      title="Block user"
                    >
                      <Ban className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto p-4 max-h-[420px]">
                {messages.map((m) => {
                  const isMine = m.senderId === user?.id;
                  const readByPeer =
                    isMine &&
                    activeConv.peer?.lastReadAt &&
                    new Date(activeConv.peer.lastReadAt) >= new Date(m.createdAt);
                  return (
                    <div
                      key={m.id}
                      className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                    >
                      <div
                        className={`max-w-md rounded-xl px-3.5 py-2 text-sm ${
                          isMine
                            ? 'bg-[#0F5C4D] text-white'
                            : 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100'
                        }`}
                      >
                        {m.content}
                      </div>
                      <span className="mt-1 font-mono text-[11px] text-slate-400 tabular-nums">
                        {new Date(m.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                        {isMine && readByPeer ? ' · Read' : ''}
                      </span>
                    </div>
                  );
                })}
                <div ref={endRef} />
              </div>

              {error && (
                <p className="px-4 py-1 text-xs text-red-600 dark:text-red-400">{error}</p>
              )}

              <form
                onSubmit={handleSend}
                className="flex items-center gap-2 border-t border-slate-200 p-3 dark:border-slate-800"
              >
                <input
                  type="text"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Write a message..."
                  className="flex-1 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
                <button
                  type="submit"
                  disabled={sending || !draft.trim()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F5C4D] px-4 py-2 text-sm font-medium text-white hover:bg-[#0c4a3e] disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" />
                  Send
                </button>
              </form>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center p-8 text-sm text-slate-500">
              Select a conversation to start messaging.
            </div>
          )}
        </section>
      </div>

      {reportUserId !== null && (
        <ReportModal
          targetType="user"
          targetId={reportUserId}
          label="conversation participant"
          onClose={() => setReportUserId(null)}
        />
      )}
    </div>
  );
};
