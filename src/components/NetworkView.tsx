import React, { useCallback, useEffect, useState } from 'react';
import {
  Ban,
  Check,
  MessageSquare,
  Search,
  UserCheck,
  UserMinus,
  UserPlus,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface PersonCard {
  id: number;
  fullName: string;
  headline: string;
  location: string;
  country: string;
  currentPosition: string;
  avatarUrl: string;
  skills: string[];
  isFollowing?: boolean;
}

interface NetworkViewProps {
  onOpenConversation: (recipientId: number) => void;
  onViewProfile?: (userId: number) => void;
}

export const NetworkView: React.FC<NetworkViewProps> = ({ onOpenConversation, onViewProfile }) => {
  const { apiFetch } = useAuth();
  const [connections, setConnections] = useState<PersonCard[]>([]);
  const [incoming, setIncoming] = useState<Array<{ connectionId: number; user: PersonCard }>>([]);
  const [outgoing, setOutgoing] = useState<Array<{ connectionId: number; user: PersonCard }>>([]);
  const [suggestions, setSuggestions] = useState<PersonCard[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<Array<{ userId: number; fullName: string }>>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<
    Array<{
      userId: number;
      fullName: string;
      headline: string;
      location: string;
      country: string;
      avatarUrl: string;
    }> | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{
        connections: PersonCard[];
        incomingRequests: Array<{ connectionId: number; user: PersonCard }>;
        outgoingRequests: Array<{ connectionId: number; user: PersonCard }>;
        suggestions: PersonCard[];
        blockedUsers: Array<{ userId: number; fullName: string }>;
      }>('/api/network/overview');
      setConnections(data.connections || []);
      setIncoming(data.incomingRequests || []);
      setOutgoing(data.outgoingRequests || []);
      setSuggestions(data.suggestions || []);
      setBlockedUsers(data.blockedUsers || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to load network');
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    const data = await apiFetch<{
      profiles: Array<{
        userId: number;
        fullName: string;
        headline: string;
        location: string;
        country: string;
        avatarUrl: string;
      }>;
    }>(`/api/profiles?q=${encodeURIComponent(searchQuery.trim())}`);
    setSearchResults(data.profiles || []);
  };

  const handleConnect = async (recipientId: number) => {
    setError('');
    try {
      await apiFetch('/api/network/connect', {
        method: 'POST',
        body: JSON.stringify({ recipientId }),
      });
      await loadOverview();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send invitation');
    }
  };

  const handleRespond = async (connectionId: number, action: 'accept' | 'reject') => {
    await apiFetch(`/api/network/requests/${connectionId}/respond`, {
      method: 'POST',
      body: JSON.stringify({ action }),
    });
    await loadOverview();
  };

  const handleDisconnect = async (userId: number) => {
    await apiFetch(`/api/network/connections/${userId}`, { method: 'DELETE' });
    await loadOverview();
  };

  const handleFollowToggle = async (userId: number) => {
    await apiFetch(`/api/network/follow/${userId}`, { method: 'POST' });
    await loadOverview();
  };

  const handleBlock = async (userId: number) => {
    await apiFetch(`/api/network/block/${userId}`, { method: 'POST' });
    await loadOverview();
  };

  const handleUnblock = async (userId: number) => {
    await apiFetch(`/api/network/block/${userId}`, { method: 'DELETE' });
    await loadOverview();
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">My Network</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Grow your professional connections across Eswatini, SADC, and global industries.
          </p>
        </div>
        <form onSubmit={handleSearch} className="flex w-full max-w-sm gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search people by name, skill, city..."
              className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg bg-[#0F5C4D] px-4 py-2 text-sm font-medium text-white hover:bg-[#0c4a3e] whitespace-nowrap shrink-0"
          >
            Search
          </button>
        </form>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      {searchResults !== null && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2 dark:border-slate-800">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              Search Results ({searchResults.length})
            </h2>
            <button
              type="button"
              onClick={() => {
                setSearchResults(null);
                setSearchQuery('');
              }}
              className="text-xs font-medium text-[#0F5C4D] hover:underline"
            >
              Clear
            </button>
          </div>
          <div className="mt-3 divide-y divide-slate-200 dark:divide-slate-800">
            {searchResults.map((p) => (
              <div key={p.userId} className="flex items-center justify-between gap-4 py-3">
                <div>
                  <button
                    type="button"
                    onClick={() => onViewProfile?.(p.userId)}
                    className="text-left text-sm font-semibold text-slate-900 hover:text-[#0F5C4D] hover:underline dark:text-white dark:hover:text-emerald-400"
                  >
                    {p.fullName}
                  </button>
                  <p className="text-xs text-slate-500">
                    {p.headline} · {p.location}, {p.country}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleConnect(p.userId)}
                    className="rounded-lg bg-[#0F5C4D] px-3 py-1.5 text-xs font-medium text-white"
                  >
                    Connect
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenConversation(p.userId)}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium dark:border-slate-700"
                  >
                    Message
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Pending Invitations */}
      {incoming.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            Invitations Waiting ({incoming.length})
          </h2>
          <div className="mt-3 divide-y divide-slate-200 dark:divide-slate-800">
            {incoming.map((inv) => (
              <div key={inv.connectionId} className="flex flex-wrap items-center justify-between gap-4 py-3">
                <div>
                  <button
                    type="button"
                    onClick={() => onViewProfile?.(inv.user.id)}
                    className="text-left text-sm font-semibold text-slate-900 hover:text-[#0F5C4D] hover:underline dark:text-white dark:hover:text-emerald-400"
                  >
                    {inv.user.fullName}
                  </button>
                  <p className="text-xs text-slate-500">
                    {inv.user.headline} · {inv.user.location}, {inv.user.country}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleRespond(inv.connectionId, 'accept')}
                    className="inline-flex items-center gap-1 rounded-lg bg-[#0F5C4D] px-3 py-1.5 text-xs font-medium text-white"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Accept
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRespond(inv.connectionId, 'reject')}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 dark:border-slate-700 dark:text-slate-300"
                  >
                    <X className="h-3.5 w-3.5" />
                    Ignore
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Main Grid: Connections & Discovery */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-6 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            Connections ({connections.length})
          </h2>
          {loading ? (
            <p className="mt-4 text-xs text-slate-500">Loading connections...</p>
          ) : connections.length === 0 ? (
            <p className="mt-4 text-xs text-slate-500">
              You have no accepted connections yet. Connect with professionals on the right to start networking.
            </p>
          ) : (
            <div className="mt-3 divide-y divide-slate-200 dark:divide-slate-800">
              {connections.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <button
                      type="button"
                      onClick={() => onViewProfile?.(c.id)}
                      className="text-left text-sm font-semibold text-slate-900 hover:text-[#0F5C4D] hover:underline dark:text-white dark:hover:text-emerald-400"
                    >
                      {c.fullName}
                    </button>
                    <p className="text-xs text-slate-500">
                      {c.headline} · {c.location}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onOpenConversation(c.id)}
                      className="rounded-lg border border-slate-300 p-1.5 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                      title="Message"
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDisconnect(c.id)}
                      className="rounded-lg border border-slate-300 p-1.5 text-slate-600 hover:text-red-600 dark:border-slate-700 dark:text-slate-400"
                      title="Remove connection"
                    >
                      <UserMinus className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBlock(c.id)}
                      className="rounded-lg border border-slate-300 p-1.5 text-slate-600 hover:text-red-600 dark:border-slate-700 dark:text-slate-400"
                      title="Block user"
                    >
                      <Ban className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {outgoing.length > 0 && (
            <div className="mt-6 border-t border-slate-200 pt-4 dark:border-slate-800">
              <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Sent Invitations ({outgoing.length})
              </h3>
              <div className="mt-2 space-y-2">
                {outgoing.map((o) => (
                  <div key={o.connectionId} className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
                    <span>{o.user.fullName} · {o.user.location}</span>
                    <span>Pending</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-6 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            People You May Know
          </h2>
          <div className="mt-3 divide-y divide-slate-200 dark:divide-slate-800">
            {suggestions.map((person) => (
              <div key={person.id} className="flex items-start justify-between gap-3 py-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-200 text-sm font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
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
                  <div>
                    <button
                      type="button"
                      onClick={() => onViewProfile?.(person.id)}
                      className="text-left text-sm font-semibold text-slate-900 hover:text-[#0F5C4D] hover:underline dark:text-white dark:hover:text-emerald-400"
                    >
                      {person.fullName}
                    </button>
                    <p className="text-xs text-slate-500">{person.headline}</p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {person.location}, {person.country}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleConnect(person.id)}
                    className="inline-flex items-center gap-1 rounded-lg bg-[#0F5C4D] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#0c4a3e]"
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    Connect
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFollowToggle(person.id)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                  >
                    <UserCheck className="h-3.5 w-3.5" />
                    {person.isFollowing ? 'Following' : 'Follow'}
                  </button>
                </div>
              </div>
            ))}
            {suggestions.length === 0 && (
              <p className="py-4 text-xs text-slate-500">
                No new suggestions right now. Use search above to discover more professionals.
              </p>
            )}
          </div>

          {blockedUsers.length > 0 && (
            <div className="mt-6 border-t border-slate-200 pt-4 dark:border-slate-800">
              <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Blocked Accounts ({blockedUsers.length})
              </h3>
              <div className="mt-2 space-y-2">
                {blockedUsers.map((b) => (
                  <div key={b.userId} className="flex items-center justify-between text-xs">
                    <span className="text-slate-600 dark:text-slate-400">{b.fullName}</span>
                    <button
                      type="button"
                      onClick={() => handleUnblock(b.userId)}
                      className="font-medium text-[#0F5C4D] hover:underline"
                    >
                      Unblock
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
