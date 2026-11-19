import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Ban,
  Check,
  ChevronUp,
  Flag,
  MessageSquarePlus,
  Search,
  Send,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ReportModal } from './ReportModal';

interface ConversationRow {
  id: number;
  isRequest: boolean;
  isConnected?: boolean;
  peerAccepted?: boolean;
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

interface NewChatPerson {
  userId: number;
  fullName: string;
  headline: string;
  location: string;
  avatarUrl: string;
}

interface MessagesViewProps {
  initialRecipientId?: number | null;
  onClearInitialRecipient?: () => void;
  onViewProfile?: (userId: number) => void;
}

function formatDayLabel(iso: string): string {
  const dt = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const target = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime();
  const diffDays = Math.round((today - target) / 86400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatShortTime(iso: string): string {
  const dt = new Date(iso);
  const now = new Date();
  if (dt.toDateString() === now.toDateString()) {
    return dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return dt.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export const MessagesView: React.FC<MessagesViewProps> = ({
  initialRecipientId,
  onClearInitialRecipient,
  onViewProfile,
}) => {
  const { user, organizations, socket, apiFetch, setUnreadMessages } = useAuth();
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [mobileShowThread, setMobileShowThread] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [filterTab, setFilterTab] = useState<'inbox' | 'requests'>('inbox');
  const [convSearch, setConvSearch] = useState('');

  // Real-time typing & confirmation states
  const [peerTyping, setPeerTyping] = useState(false);
  const [confirmBlockPeerId, setConfirmBlockPeerId] = useState<number | null>(null);
  const [confirmDeleteConvId, setConfirmDeleteConvId] = useState<number | null>(null);
  const [confirmDeleteMsgId, setConfirmDeleteMsgId] = useState<number | null>(null);
  const [deletingMsgId, setDeletingMsgId] = useState<number | null>(null);
  const [reportUserId, setReportUserId] = useState<number | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [error, setError] = useState('');

  // New conversation modal (connected peers only)
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [newChatQuery, setNewChatQuery] = useState('');
  const [connectedPeople, setConnectedPeople] = useState<NewChatPerson[]>([]);
  const [loadingPeople, setLoadingPeople] = useState(false);

  const endRef = useRef<HTMLDivElement | null>(null);
  const typingTimeoutRef = useRef<number | null>(null);
  const peerTypingTimerRef = useRef<number | null>(null);

  const loadConversations = useCallback(async () => {
    try {
      const data = await apiFetch<{
        conversations: ConversationRow[];
        totalUnreadMessages?: number;
      }>('/api/conversations');
      const list = data.conversations || [];
      setConversations(list);
      if (typeof data.totalUnreadMessages === 'number') {
        setUnreadMessages(data.totalUnreadMessages);
      }
      setActiveId((prev) => {
        if (prev && list.some((c) => c.id === prev)) return prev;
        const firstInbox = list.find((c) => !c.isRequest);
        return firstInbox?.id ?? list[0]?.id ?? null;
      });
    } catch {
      // ignore transient poll error
    }
  }, [apiFetch, setUnreadMessages]);

  const loadMessages = useCallback(
    async (convId: number) => {
      try {
        const data = await apiFetch<{ messages: ChatMessage[]; hasMore?: boolean }>(
          `/api/conversations/${convId}/messages?limit=50`
        );
        setMessages(data.messages || []);
        setHasMoreMessages(Boolean(data.hasMore));
        loadConversations();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Unable to load conversation');
      }
    },
    [apiFetch, loadConversations]
  );

  const handleLoadOlder = async () => {
    if (!activeId || messages.length === 0 || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const oldestId = messages[0].id;
      const data = await apiFetch<{ messages: ChatMessage[]; hasMore?: boolean }>(
        `/api/conversations/${activeId}/messages?limit=50&before=${oldestId}`
      );
      setMessages((prev) => [...(data.messages || []), ...prev]);
      setHasMoreMessages(Boolean(data.hasMore));
    } catch {
      // ignore
    } finally {
      setLoadingOlder(false);
    }
  };

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (!initialRecipientId) return;
    setError('');
    apiFetch<{ conversationId: number; isRequest?: boolean }>('/api/conversations', {
      method: 'POST',
      body: JSON.stringify({ recipientId: initialRecipientId }),
    })
      .then((res) => {
        setActiveId(res.conversationId);
        setMobileShowThread(true);
        setFilterTab('inbox');
        loadConversations();
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Unable to start conversation');
      })
      .finally(() => {
        onClearInitialRecipient?.();
      });
  }, [apiFetch, initialRecipientId, loadConversations, onClearInitialRecipient]);

  useEffect(() => {
    if (!activeId) return;
    setPeerTyping(false);
    setConfirmBlockPeerId(null);
    setConfirmDeleteConvId(null);
    setConfirmDeleteMsgId(null);
    loadMessages(activeId);

    if (socket) {
      socket.emit('conversation:join', activeId);

      const handleNew = (msg: ChatMessage) => {
        if (msg.conversationId === activeId) {
          setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
          if (msg.senderId !== user?.id) {
            setPeerTyping(false);
            apiFetch(`/api/conversations/${activeId}/read`, { method: 'POST' }).catch(() => {});
          }
        }
        loadConversations();
      };

      const handleDeleted = (payload: { conversationId: number; messageId: number }) => {
        if (payload.conversationId === activeId) {
          setMessages((prev) => prev.filter((m) => m.id !== payload.messageId));
        }
        loadConversations();
      };

      const handleRead = (payload: {
        conversationId: number;
        userId: number;
        readAt: string;
      }) => {
        if (payload.conversationId === activeId && payload.userId !== user?.id) {
          setConversations((prev) =>
            prev.map((c) =>
              c.id === activeId && c.peer
                ? { ...c, peer: { ...c.peer, lastReadAt: payload.readAt } }
                : c
            )
          );
        }
      };

      const handleTyping = (payload: {
        conversationId: number;
        userId: number;
        isTyping: boolean;
      }) => {
        if (payload.conversationId !== activeId || payload.userId === user?.id) return;
        setPeerTyping(payload.isTyping);
        if (peerTypingTimerRef.current) window.clearTimeout(peerTypingTimerRef.current);
        if (payload.isTyping) {
          peerTypingTimerRef.current = window.setTimeout(() => setPeerTyping(false), 3500);
        }
      };

      socket.on('message:new', handleNew);
      socket.on('message:deleted', handleDeleted);
      socket.on('conversation:read', handleRead);
      socket.on('conversation:typing', handleTyping);
      return () => {
        socket.emit('conversation:typing', { conversationId: activeId, isTyping: false });
        socket.emit('conversation:leave', activeId);
        socket.off('message:new', handleNew);
        socket.off('message:deleted', handleDeleted);
        socket.off('conversation:read', handleRead);
        socket.off('conversation:typing', handleTyping);
      };
    }
  }, [activeId, apiFetch, loadConversations, loadMessages, socket, user?.id]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, peerTyping]);

  useEffect(() => {
    if (!newChatOpen) return;
    setLoadingPeople(true);
    apiFetch<{
      connections: Array<{
        id: number;
        fullName: string;
        headline: string;
        location: string;
        avatarUrl: string;
      }>;
    }>('/api/network/overview')
      .then((net) => {
        setConnectedPeople(
          (net.connections || []).map((c) => ({
            userId: c.id,
            fullName: c.fullName,
            headline: c.headline,
            location: c.location,
            avatarUrl: c.avatarUrl,
          }))
        );
      })
      .catch(() => {
        setConnectedPeople([]);
      })
      .finally(() => {
        setLoadingPeople(false);
      });
  }, [apiFetch, newChatOpen]);

  const activeConv = conversations.find((c) => c.id === activeId) || null;
  const requestCount = conversations.filter((c) => c.isRequest).length;
  const visibleConvs = conversations.filter((c) => {
    const tabMatches = filterTab === 'requests' ? c.isRequest : !c.isRequest;
    if (!tabMatches) return false;
    if (convSearch.trim()) {
      const q = convSearch.trim().toLowerCase();
      const hay = `${c.peer?.fullName || ''} ${c.peer?.headline || ''} ${c.lastMessage?.content || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const filteredConnections = connectedPeople.filter((p) => {
    if (!newChatQuery.trim()) return true;
    const q = newChatQuery.trim().toLowerCase();
    return `${p.fullName} ${p.headline} ${p.location}`.toLowerCase().includes(q);
  });

  const handleSelectTab = (tab: 'inbox' | 'requests') => {
    setFilterTab(tab);
    const matching = conversations.filter((c) => (tab === 'requests' ? c.isRequest : !c.isRequest));
    if (matching.length > 0) {
      setActiveId(matching[0].id);
    } else {
      setActiveId(null);
      setMessages([]);
    }
  };

  const emitTyping = (isTyping: boolean) => {
    if (!socket || !activeId) return;
    socket.emit('conversation:typing', { conversationId: activeId, isTyping });
  };

  const handleDraftChange = (value: string) => {
    setDraft(value);
    emitTyping(value.trim().length > 0);
    if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
    if (value.trim()) {
      typingTimeoutRef.current = window.setTimeout(() => emitTyping(false), 2200);
    }
  };

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!activeId || !draft.trim() || sending) return;
    setSending(true);
    setError('');
    emitTyping(false);
    try {
      const res = await apiFetch<{ message: ChatMessage }>(
        `/api/conversations/${activeId}/messages`,
        {
          method: 'POST',
          body: JSON.stringify({ content: draft.trim() }),
        }
      );
      setDraft('');
      setTemplatesOpen(false);
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

  const handleStartConversation = async (recipientId: number) => {
    setError('');
    try {
      const res = await apiFetch<{ conversationId: number }>('/api/conversations', {
        method: 'POST',
        body: JSON.stringify({ recipientId }),
      });
      setNewChatOpen(false);
      setNewChatQuery('');
      setFilterTab('inbox');
      setActiveId(res.conversationId);
      setMobileShowThread(true);
      await loadConversations();
    } catch (err: unknown) {
      setNewChatOpen(false);
      setError(err instanceof Error ? err.message : 'Unable to start conversation');
    }
  };

  const handleAcceptRequest = async (convId: number) => {
    setError('');
    try {
      await apiFetch(`/api/conversations/${convId}/accept`, { method: 'POST' });
      setFilterTab('inbox');
      await loadConversations();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to accept conversation');
    }
  };

  const handleDismissConversation = async (convId: number) => {
    setError('');
    try {
      await apiFetch(`/api/conversations/${convId}`, { method: 'DELETE' });
      setConfirmDeleteConvId(null);
      if (activeId === convId) {
        setActiveId(null);
        setMessages([]);
        setMobileShowThread(false);
      }
      await loadConversations();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to delete conversation');
    }
  };

  const handleDeleteMessage = async (convId: number, messageId: number) => {
    setError('');
    setDeletingMsgId(messageId);
    try {
      await apiFetch(`/api/conversations/${convId}/messages/${messageId}`, {
        method: 'DELETE',
      });
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
      setConfirmDeleteMsgId(null);
      await loadConversations();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to delete message');
    } finally {
      setDeletingMsgId(null);
    }
  };

  const handleBlockPeer = async (peerId: number) => {
    setError('');
    try {
      await apiFetch(`/api/network/block/${peerId}`, { method: 'POST' });
      setConfirmBlockPeerId(null);
      setActiveId(null);
      setMessages([]);
      setMobileShowThread(false);
      await loadConversations();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to block user');
    }
  };

  const quickTemplates = [
    ...(organizations.length > 0
      ? [
          {
            label: 'Application follow-up',
            text: `Hi ${activeConv?.peer?.fullName?.split(' ')[0] || 'there'}, thank you for applying with ${organizations[0].name}. Would you be available for a brief introductory conversation this week?`,
          },
          {
            label: 'Interview availability',
            text: `Hi ${activeConv?.peer?.fullName?.split(' ')[0] || 'there'}, we would like to schedule your interview. Please let us know your preferred time slots over the next few days.`,
          },
        ]
      : []),
    {
      label: 'Connect & collaborate',
      text: `Hi ${activeConv?.peer?.fullName?.split(' ')[0] || 'there'}, great connecting with you on ResuMind! Let me know if you are free for a quick chat this week.`,
    },
    {
      label: 'Thank you',
      text: 'Thank you for getting back to me. Looking forward to staying in touch!',
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-3 px-4 py-6">
      {error && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-medium text-red-800 dark:border-red-900/70 dark:bg-red-950/60 dark:text-red-200"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError('')}
            aria-label="Dismiss error"
            className="rounded p-0.5 text-red-600 hover:bg-red-100 dark:text-red-300 dark:hover:bg-red-900/50"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="grid h-[620px] grid-cols-1 overflow-hidden rounded-xl border border-slate-200 bg-white md:grid-cols-12 dark:border-slate-800 dark:bg-slate-900">
        {/* Conversation List */}
        <aside
          className={`flex flex-col border-slate-200 md:col-span-4 md:border-r dark:border-slate-800 ${
            mobileShowThread ? 'hidden md:flex' : 'flex'
          }`}
        >
          <div className="space-y-2.5 border-b border-slate-200 p-3 dark:border-slate-800">
            <div className="flex items-center justify-between gap-2">
              <h1 className="text-sm font-bold text-slate-900 dark:text-white">Messages</h1>
              <div className="flex items-center gap-1.5">
                {requestCount > 0 && (
                  <div className="flex items-center gap-0.5 rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
                    <button
                      type="button"
                      onClick={() => handleSelectTab('inbox')}
                      className={`rounded-md px-2 py-1 text-[11px] font-medium ${
                        filterTab === 'inbox'
                          ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                          : 'text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      Inbox
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectTab('requests')}
                      className={`rounded-md px-2 py-1 text-[11px] font-medium ${
                        filterTab === 'requests'
                          ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                          : 'text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      Requests ({requestCount})
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setNewChatOpen(true)}
                  title="New message"
                  className="inline-flex items-center gap-1 rounded-lg bg-[#0F5C4D] px-2.5 py-1.5 text-[11px] font-medium text-white hover:bg-[#0c4a3e]"
                >
                  <MessageSquarePlus className="h-3.5 w-3.5" />
                  New
                </button>
              </div>
            </div>

            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={convSearch}
                onChange={(e) => setConvSearch(e.target.value)}
                placeholder="Search conversations..."
                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-7 text-xs text-slate-900 focus:border-[#0F5C4D] focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
              {convSearch && (
                <button
                  type="button"
                  onClick={() => setConvSearch('')}
                  className="absolute right-2 top-1.5 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 divide-y divide-slate-200 overflow-y-auto dark:divide-slate-800">
            {visibleConvs.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                <p>
                  {convSearch
                    ? 'No conversations match your search.'
                    : filterTab === 'requests'
                      ? 'No pending message requests.'
                      : 'No conversations yet.'}
                </p>
                {!convSearch && filterTab === 'inbox' && (
                  <button
                    type="button"
                    onClick={() => setNewChatOpen(true)}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[#0F5C4D] px-3 py-1.5 text-xs font-medium text-white"
                  >
                    <MessageSquarePlus className="h-3.5 w-3.5" />
                    Start a Conversation
                  </button>
                )}
              </div>
            ) : (
              visibleConvs.map((conv) => (
                <button
                  key={conv.id}
                  type="button"
                  onClick={() => {
                    setActiveId(conv.id);
                    setMobileShowThread(true);
                  }}
                  className={`flex w-full items-center gap-3 p-3 text-left transition-colors ${
                    activeId === conv.id
                      ? 'bg-emerald-50/70 dark:bg-slate-800/80'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#0F5C4D] text-xs font-bold text-white">
                    {conv.peer?.avatarUrl ? (
                      <img
                        src={conv.peer.avatarUrl}
                        alt={conv.peer.fullName}
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      (conv.peer?.fullName || 'C').charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                        {conv.peer?.fullName || 'Conversation'}
                      </p>
                      <span className="shrink-0 font-mono text-[10px] text-slate-400 tabular-nums">
                        {conv.lastMessage ? formatShortTime(conv.lastMessage.createdAt) : ''}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      <p className="truncate text-xs text-slate-500">
                        {conv.lastMessage
                          ? `${conv.lastMessage.senderId === user?.id ? 'You: ' : ''}${conv.lastMessage.content}`
                          : conv.peer?.headline || 'New conversation'}
                      </p>
                      {conv.unreadCount > 0 && (
                        <span className="shrink-0 rounded-full bg-[#0F5C4D] px-1.5 py-0.5 font-mono text-[10px] font-semibold leading-none text-white tabular-nums">
                          {conv.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        {/* Active Thread */}
        <section
          className={`flex flex-col md:col-span-8 ${
            mobileShowThread ? 'flex' : 'hidden md:flex'
          }`}
        >
          {activeConv ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                <div className="flex min-w-0 items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setMobileShowThread(false)}
                    className="rounded-lg border border-slate-200 p-1.5 text-slate-600 md:hidden dark:border-slate-700 dark:text-slate-300"
                    aria-label="Back to conversations"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#0F5C4D] text-xs font-bold text-white">
                    {activeConv.peer?.avatarUrl ? (
                      <img
                        src={activeConv.peer.avatarUrl}
                        alt={activeConv.peer.fullName}
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      (activeConv.peer?.fullName || 'C').charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0">
                    {activeConv.peer && onViewProfile ? (
                      <button
                        type="button"
                        onClick={() => onViewProfile(activeConv.peer!.userId)}
                        className="truncate text-left text-sm font-semibold text-slate-900 hover:text-[#0F5C4D] hover:underline dark:text-white"
                      >
                        {activeConv.peer.fullName}
                      </button>
                    ) : (
                      <h2 className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                        {activeConv.peer?.fullName}
                      </h2>
                    )}
                    <p className="truncate text-xs text-slate-500">
                      {peerTyping ? (
                        <span className="font-medium text-[#0F5C4D] dark:text-emerald-400">
                          Typing...
                        </span>
                      ) : (
                        activeConv.peer?.headline
                      )}
                    </p>
                  </div>
                </div>

                {activeConv.peer && (
                  <div className="flex items-center gap-2">
                    {activeConv.isRequest && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleAcceptRequest(activeConv.id)}
                          className="inline-flex items-center gap-1 rounded-lg bg-[#0F5C4D] px-2.5 py-1 text-xs font-medium text-white"
                        >
                          <Check className="h-3.5 w-3.5" />
                          Accept
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDismissConversation(activeConv.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Decline
                        </button>
                      </>
                    )}
                    {!activeConv.isRequest && (
                      <button
                        type="button"
                        onClick={() =>
                          setConfirmDeleteConvId(
                            confirmDeleteConvId === activeConv.id ? null : activeConv.id
                          )
                        }
                        className={`rounded-lg border p-1.5 transition-colors ${
                          confirmDeleteConvId === activeConv.id
                            ? 'border-red-300 bg-red-50 text-red-600 dark:border-red-800 dark:bg-red-950/60 dark:text-red-400'
                            : 'border-slate-200 text-slate-500 hover:text-red-600 dark:border-slate-700'
                        }`}
                        title="Delete conversation"
                        aria-label="Delete conversation"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setReportUserId(activeConv.peer!.userId)}
                      className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:text-red-600 dark:border-slate-700"
                      title="Report user"
                      aria-label="Report user"
                    >
                      <Flag className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setConfirmBlockPeerId(
                          confirmBlockPeerId === activeConv.peer!.userId
                            ? null
                            : activeConv.peer!.userId
                        )
                      }
                      className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:text-red-600 dark:border-slate-700"
                      title="Block user"
                      aria-label="Block user"
                    >
                      <Ban className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {confirmDeleteConvId === activeConv.id && (
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/60 dark:text-red-200">
                  <span>Delete this conversation from your inbox?</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteConvId(null)}
                      className="rounded border border-slate-300 bg-white px-2.5 py-1 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDismissConversation(activeConv.id)}
                      className="rounded bg-red-600 px-2.5 py-1 font-medium text-white hover:bg-red-700"
                    >
                      Delete Conversation
                    </button>
                  </div>
                </div>
              )}

              {confirmBlockPeerId !== null && activeConv.peer && (
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/60 dark:text-red-200">
                  <span>
                    Block {activeConv.peer.fullName}? They will no longer be able to message or
                    view your profile.
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmBlockPeerId(null)}
                      className="rounded border border-slate-300 bg-white px-2.5 py-1 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBlockPeer(confirmBlockPeerId)}
                      className="rounded bg-red-600 px-2.5 py-1 font-medium text-white"
                    >
                      Confirm Block
                    </button>
                  </div>
                </div>
              )}

              <div className="flex-1 space-y-3 overflow-y-auto p-4">
                {hasMoreMessages && (
                  <div className="flex justify-center pb-2">
                    <button
                      type="button"
                      onClick={handleLoadOlder}
                      disabled={loadingOlder}
                      className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                    >
                      <ChevronUp className="h-3 w-3" />
                      {loadingOlder ? 'Loading...' : 'Load older messages'}
                    </button>
                  </div>
                )}

                {messages.length === 0 ? (
                  <p className="py-12 text-center text-xs text-slate-400">
                    No messages yet. Say hello to start the conversation.
                  </p>
                ) : (
                  messages.map((m, idx) => {
                    const isMine = m.senderId === user?.id;
                    const readByPeer =
                      isMine &&
                      activeConv.peer?.lastReadAt &&
                      new Date(activeConv.peer.lastReadAt) >= new Date(m.createdAt);

                    const dayLabel = formatDayLabel(m.createdAt);
                    const prevDayLabel =
                      idx > 0 ? formatDayLabel(messages[idx - 1].createdAt) : '';
                    const showDayDivider = dayLabel !== prevDayLabel;

                    return (
                      <React.Fragment key={m.id}>
                        {showDayDivider && (
                          <div className="flex items-center gap-3 py-2">
                            <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                              {dayLabel}
                            </span>
                            <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
                          </div>
                        )}
                        <div
                          className={`group flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                        >
                          <div
                            className={`max-w-md whitespace-pre-wrap break-words rounded-xl px-3.5 py-2 text-sm ${
                              isMine
                                ? 'bg-[#0F5C4D] text-white'
                                : 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100'
                            }`}
                          >
                            {m.content}
                          </div>
                          <div className="mt-1 flex items-center gap-2">
                            <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                              {new Date(m.createdAt).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                              {isMine && readByPeer ? ' · Read' : ''}
                            </span>
                            {isMine &&
                              (confirmDeleteMsgId === m.id ? (
                                <span className="inline-flex items-center gap-1.5 text-[11px]">
                                  <button
                                    type="button"
                                    disabled={deletingMsgId === m.id}
                                    onClick={() => handleDeleteMessage(activeConv.id, m.id)}
                                    className="font-semibold text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
                                  >
                                    {deletingMsgId === m.id ? 'Deleting...' : 'Delete'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteMsgId(null)}
                                    className="text-slate-500 hover:text-slate-700 dark:text-slate-400"
                                  >
                                    Cancel
                                  </button>
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteMsgId(m.id)}
                                  title="Delete message"
                                  aria-label="Delete message"
                                  className="rounded p-0.5 text-slate-400 opacity-70 transition-opacity hover:text-red-600 group-hover:opacity-100 dark:hover:text-red-400"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              ))}
                          </div>
                        </div>
                      </React.Fragment>
                    );
                  })
                )}

                {peerTyping && (
                  <div className="flex items-start">
                    <div className="rounded-xl bg-slate-100 px-3.5 py-2 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                      {activeConv.peer?.fullName?.split(' ')[0] || 'Participant'} is typing...
                    </div>
                  </div>
                )}

                <div ref={endRef} />
              </div>

              {activeConv.isConnected === false ? (
                <div className="border-t border-slate-200 bg-slate-50 px-4 py-3 text-center text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                  You can only message users you are connected with. Connect with{' '}
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {activeConv.peer?.fullName || 'this professional'}
                  </span>{' '}
                  in Network to send new messages.
                </div>
              ) : (
                <>
                  {templatesOpen && (
                    <div className="border-t border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-950">
                      <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold text-slate-500">
                        <span>Quick Reply Templates</span>
                        <button type="button" onClick={() => setTemplatesOpen(false)}>
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {quickTemplates.map((tpl) => (
                          <button
                            key={tpl.label}
                            type="button"
                            onClick={() => {
                              handleDraftChange(tpl.text);
                              setTemplatesOpen(false);
                            }}
                            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:border-[#0F5C4D] hover:text-[#0F5C4D] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                          >
                            {tpl.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <form
                    onSubmit={handleSend}
                    className="flex items-end gap-2 border-t border-slate-200 p-3 dark:border-slate-800"
                  >
                    <button
                      type="button"
                      onClick={() => setTemplatesOpen((v) => !v)}
                      title="Quick reply templates"
                      className={`rounded-lg border p-2 transition-colors ${
                        templatesOpen
                          ? 'border-[#0F5C4D] bg-emerald-50 text-[#0F5C4D] dark:bg-slate-800 dark:text-emerald-400'
                          : 'border-slate-300 text-slate-500 hover:text-slate-800 dark:border-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <Sparkles className="h-4 w-4" />
                    </button>
                    <textarea
                      rows={1}
                      value={draft}
                      onChange={(e) => handleDraftChange(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSend();
                        }
                      }}
                      onBlur={() => emitTyping(false)}
                      placeholder="Write a message... (Enter to send, Shift+Enter for new line)"
                      className="max-h-28 min-h-[38px] flex-1 resize-none rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm focus:border-[#0F5C4D] focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950"
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
              )}
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center p-8 text-center text-sm text-slate-500">
              <p>Select a conversation or start a new one.</p>
              <button
                type="button"
                onClick={() => setNewChatOpen(true)}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[#0F5C4D] px-3.5 py-2 text-xs font-medium text-white"
              >
                <MessageSquarePlus className="h-3.5 w-3.5" />
                New Message
              </button>
            </div>
          )}
        </section>
      </div>

      {/* New Message Picker Modal (Connections Only) */}
      {newChatOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          onClick={() => setNewChatOpen(false)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setNewChatOpen(false);
          }}
        >
          <div
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  Message a Connection
                </h2>
                <p className="text-[11px] text-slate-500">
                  Direct messaging is available with your accepted connections.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setNewChatOpen(false)}
                aria-label="Close modal"
                className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="relative mt-3">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={newChatQuery}
                onChange={(e) => setNewChatQuery(e.target.value)}
                placeholder="Search your connections..."
                className="w-full rounded-lg border border-slate-300 bg-slate-50 py-2 pl-8 pr-8 text-xs text-slate-900 focus:border-[#0F5C4D] focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
              {newChatQuery && (
                <button
                  type="button"
                  onClick={() => setNewChatQuery('')}
                  aria-label="Clear search"
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="mt-3 max-h-72 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
              {loadingPeople ? (
                <p className="py-4 text-center text-xs text-slate-500">Loading connections...</p>
              ) : filteredConnections.length === 0 ? (
                <p className="py-4 text-center text-xs text-slate-500">
                  {newChatQuery.trim()
                    ? 'No matching connections found. You can only message professionals you are connected with.'
                    : 'No connections yet. Connect with professionals in the Network tab to message them.'}
                </p>
              ) : (
                filteredConnections.map((person) => (
                  <button
                    key={person.userId}
                    type="button"
                    onClick={() => handleStartConversation(person.userId)}
                    className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#0F5C4D] text-xs font-bold text-white">
                      {person.avatarUrl ? (
                        <img
                          src={person.avatarUrl}
                          alt={person.fullName}
                          referrerPolicy="no-referrer"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        person.fullName.charAt(0).toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-slate-900 dark:text-white">
                        {person.fullName}
                      </p>
                      <p className="truncate text-[11px] text-slate-500">
                        {person.headline}
                        {person.location ? ` · ${person.location}` : ''}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

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
