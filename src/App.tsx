import React, { useEffect, useRef, useState } from 'react';
import {
  Bell,
  Briefcase,
  Building2,
  ChevronDown,
  Home,
  LogOut,
  Menu,
  MessageSquare,
  Moon,
  Search,
  Sparkles,
  Sun,
  TrendingUp,
  User,
  Users,
  X,
} from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppTab, JobListing, OrganizationSummary } from './types';
import { LandingView } from './components/LandingView';
import { HomeFeed } from './components/HomeFeed';
import { NetworkView } from './components/NetworkView';
import { JobsView } from './components/JobsView';
import { MessagesView } from './components/MessagesView';
import { NotificationsView } from './components/NotificationsView';
import { ProfileView } from './components/ProfileView';
import { CareerStudioView } from './components/CareerStudioView';
import { EmployerWorkspaceView } from './components/EmployerWorkspaceView';
import { OfflineIndicator, PWAInstallButton } from './components/PWAInstallButton';

interface SearchPerson {
  userId: number;
  fullName: string;
  headline: string;
  location: string;
  avatarUrl: string;
}

const AuthenticatedShell: React.FC = () => {
  const { user, profile, unreadNotifications, loading, logout, apiFetch } = useAuth();
  const [activeTab, setActiveTab] = useState<AppTab>('home');
  const [viewedProfileUserId, setViewedProfileUserId] = useState<number | null>(null);
  const [messageRecipientId, setMessageRecipientId] = useState<number | null>(null);
  const [initialJobQuery, setInitialJobQuery] = useState('');
  const [dark, setDark] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);

  // Topbar Global Search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchFilter, setSearchFilter] = useState<'all' | 'people' | 'jobs' | 'companies'>('all');
  const [searchPeople, setSearchPeople] = useState<SearchPerson[]>([]);
  const [searchJobs, setSearchJobs] = useState<JobListing[]>([]);
  const [searchCompanies, setSearchCompanies] = useState<OrganizationSummary[]>([]);
  const [trendingKeywords, setTrendingKeywords] = useState<
    Array<{ keyword: string; count: number; category: string }>
  >([]);
  const [searching, setSearching] = useState(false);
  const searchBoxRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Topbar Profile Popup
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (searchBoxRef.current && !searchBoxRef.current.contains(target)) {
        setSearchOpen(false);
      }
      if (profileMenuRef.current && !profileMenuRef.current.contains(target)) {
        setProfileMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSearchOpen(false);
        setProfileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const loadTrendingKeywords = async () => {
    try {
      const res = await apiFetch<{
        keywords: Array<{ keyword: string; count: number; category: string }>;
      }>('/api/profiles/trending');
      setTrendingKeywords(res.keywords || []);
    } catch {
      // ignore
    }
  };

  const recordSearchKeyword = (rawQuery: string) => {
    const trimmed = rawQuery.trim();
    if (trimmed.length < 2) return;
    apiFetch('/api/profiles/trending', {
      method: 'POST',
      body: JSON.stringify({ query: trimmed }),
    })
      .then(() => loadTrendingKeywords())
      .catch(() => {});
  };

  useEffect(() => {
    if (!user) return;
    loadTrendingKeywords();
  }, [user]);

  useEffect(() => {
    const q = searchQuery.trim();
    if (!q || !user) {
      setSearchPeople([]);
      setSearchJobs([]);
      setSearchCompanies([]);
      return;
    }
    setSearching(true);
    const timer = window.setTimeout(async () => {
      try {
        const [pRes, jRes, cRes] = await Promise.all([
          apiFetch<{ profiles: SearchPerson[] }>(`/api/profiles?q=${encodeURIComponent(q)}`),
          apiFetch<{ jobs: JobListing[] }>(`/api/jobs?q=${encodeURIComponent(q)}`),
          apiFetch<{ organizations: OrganizationSummary[] }>(
            `/api/organizations?q=${encodeURIComponent(q)}`
          ),
        ]);
        setSearchPeople((pRes.profiles || []).slice(0, 6));
        setSearchJobs((jRes.jobs || []).slice(0, 6));
        setSearchCompanies((cRes.organizations || []).slice(0, 6));
      } catch {
        setSearchPeople([]);
        setSearchJobs([]);
        setSearchCompanies([]);
      } finally {
        setSearching(false);
      }
    }, 240);
    return () => window.clearTimeout(timer);
  }, [apiFetch, searchQuery, user]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-600 dark:bg-slate-950 dark:text-slate-300">
        Loading ResuMind...
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <LandingView />
        <OfflineIndicator />
      </>
    );
  }

  const primaryNav: Array<{
    id: AppTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
  }> = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'network', label: 'Network', icon: Users },
    { id: 'jobs', label: 'Jobs', icon: Briefcase },
    { id: 'messages', label: 'Messages', icon: MessageSquare },
    { id: 'notifications', label: 'Alerts', icon: Bell, badge: unreadNotifications },
    { id: 'career', label: 'Studio', icon: Sparkles },
    { id: 'employers', label: 'Employers', icon: Building2 },
  ];

  const allNavItems: Array<{
    id: AppTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
  }> = [
    ...primaryNav,
    { id: 'profile', label: 'My Profile', icon: User },
  ];

  const handleViewProfile = (userId: number) => {
    setViewedProfileUserId(userId);
    setActiveTab('profile');
    setSearchOpen(false);
    setProfileMenuOpen(false);
  };

  const handleOpenConversation = (recipientId: number) => {
    setMessageRecipientId(recipientId);
    setActiveTab('messages');
  };

  const handleSelectNav = (tab: AppTab) => {
    if (tab === 'profile') {
      setViewedProfileUserId(null);
    }
    setActiveTab(tab);
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-16 text-slate-900 md:pb-0 dark:bg-slate-950 dark:text-slate-100">
      <header className="no-print sticky top-0 z-30 border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-1.5">
          {/* Brand + Global Search Bar */}
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <button
              type="button"
              onClick={() => handleSelectNav('home')}
              className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0"
            >
              ResuMind
            </button>

            <div ref={searchBoxRef} className="relative hidden w-full max-w-xs sm:block">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                ref={searchInputRef}
                type="text"
                aria-label="Search people, jobs, companies"
                value={searchQuery}
                onFocus={() => {
                  setSearchOpen(true);
                  if (!searchQuery.trim()) {
                    loadTrendingKeywords();
                  }
                }}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSearchOpen(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && searchQuery.trim().length >= 2) {
                    recordSearchKeyword(searchQuery);
                  }
                }}
                placeholder="Search people, jobs, companies..."
                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-8 text-xs text-slate-900 focus:border-[#0F5C4D] focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
              {searchQuery.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSearchFilter('all');
                    setSearchOpen(true);
                    loadTrendingKeywords();
                    searchInputRef.current?.focus();
                  }}
                  aria-label="Clear search"
                  className="absolute right-2 top-1.5 rounded p-0.5 text-slate-400 hover:bg-slate-200/70 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}

              {searchOpen && !searchQuery.trim() && (
                <div className="absolute left-0 top-full z-40 mt-1.5 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg sm:w-96 dark:border-slate-700 dark:bg-slate-900">
                  <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3.5 py-2 dark:border-slate-800 dark:bg-slate-950">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                      <TrendingUp className="h-3.5 w-3.5 text-[#0F5C4D] dark:text-emerald-400" />
                      Trending
                    </span>
                    <span className="text-[11px] text-slate-400">Popular keywords</span>
                  </div>

                  {trendingKeywords.length === 0 ? (
                    <p className="px-4 py-3 text-xs text-slate-500">
                      No trending keywords yet. Search for a person, role, or company and press
                      Enter.
                    </p>
                  ) : (
                    <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                      {trendingKeywords.map((item) => (
                        <button
                          key={item.keyword}
                          type="button"
                          onClick={() => {
                            setSearchQuery(item.keyword);
                            setSearchFilter('all');
                            recordSearchKeyword(item.keyword);
                            searchInputRef.current?.focus();
                          }}
                          className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800"
                        >
                          <span className="flex min-w-0 items-center gap-2.5">
                            <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                            <span className="truncate text-xs font-medium text-slate-900 dark:text-white">
                              {item.keyword}
                            </span>
                          </span>
                          <span className="shrink-0 text-[11px] text-slate-400">
                            {item.category}
                            {item.count > 0 ? (
                              <span className="ml-1.5 font-mono tabular-nums">· {item.count}</span>
                            ) : null}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {searchOpen && searchQuery.trim().length > 0 && (() => {
                const visiblePeople =
                  searchFilter === 'all' || searchFilter === 'people' ? searchPeople : [];
                const visibleJobs =
                  searchFilter === 'all' || searchFilter === 'jobs' ? searchJobs : [];
                const visibleCompanies =
                  searchFilter === 'all' || searchFilter === 'companies' ? searchCompanies : [];
                const totalVisible =
                  visiblePeople.length + visibleJobs.length + visibleCompanies.length;

                return (
                  <div className="absolute left-0 top-full z-40 mt-1.5 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg sm:w-96 dark:border-slate-700 dark:bg-slate-900">
                    <div className="flex items-center gap-1 border-b border-slate-200 bg-slate-50 px-2.5 pt-2 dark:border-slate-800 dark:bg-slate-950">
                      {(
                        [
                          {
                            id: 'all',
                            label: 'All',
                            count:
                              searchPeople.length + searchJobs.length + searchCompanies.length,
                          },
                          { id: 'people', label: 'People', count: searchPeople.length },
                          { id: 'jobs', label: 'Jobs', count: searchJobs.length },
                          { id: 'companies', label: 'Companies', count: searchCompanies.length },
                        ] as const
                      ).map((tab) => {
                        const active = searchFilter === tab.id;
                        return (
                          <button
                            key={tab.id}
                            type="button"
                            onClick={() => setSearchFilter(tab.id)}
                            className={`border-b-2 px-2.5 pb-2 pt-1 text-[11px] font-medium transition-colors whitespace-nowrap ${
                              active
                                ? 'border-[#0F5C4D] text-[#0F5C4D] dark:border-emerald-400 dark:text-emerald-400'
                                : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                            }`}
                          >
                            {tab.label}{' '}
                            <span className="font-mono text-[10px] tabular-nums opacity-75">
                              {tab.count}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {searching ? (
                      <p className="px-4 py-3 text-xs text-slate-500">Searching...</p>
                    ) : totalVisible === 0 ? (
                      <p className="px-4 py-3 text-xs text-slate-500">
                        No matching {searchFilter === 'all' ? 'results' : searchFilter} found.
                      </p>
                    ) : (
                      <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                        {visiblePeople.map((person) => (
                          <button
                            key={`p-${person.userId}`}
                            type="button"
                            onClick={() => {
                              recordSearchKeyword(searchQuery);
                              handleViewProfile(person.userId);
                              setSearchQuery('');
                            }}
                            className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800"
                          >
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#0F5C4D] text-xs font-semibold text-white">
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
                                Person · {person.headline || person.location}
                              </p>
                            </div>
                          </button>
                        ))}
                        {visibleJobs.map((job) => (
                          <button
                            key={`j-${job.id}`}
                            type="button"
                            onClick={() => {
                              recordSearchKeyword(searchQuery);
                              setInitialJobQuery(job.title);
                              setActiveTab('jobs');
                              setSearchOpen(false);
                              setSearchQuery('');
                            }}
                            className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800"
                          >
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                              <Briefcase className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-semibold text-slate-900 dark:text-white">
                                {job.title}
                              </p>
                              <p className="truncate text-[11px] text-slate-500">
                                Job · {job.organization.name} · {job.location}
                              </p>
                            </div>
                          </button>
                        ))}
                        {visibleCompanies.map((org) => (
                          <button
                            key={`c-${org.id}`}
                            type="button"
                            onClick={() => {
                              recordSearchKeyword(searchQuery);
                              setInitialJobQuery(org.name);
                              setActiveTab('jobs');
                              setSearchOpen(false);
                              setSearchQuery('');
                            }}
                            className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800"
                          >
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                              <Building2 className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-semibold text-slate-900 dark:text-white">
                                {org.name}
                              </p>
                              <p className="truncate text-[11px] text-slate-500">
                                Company · {org.industry} · {org.location}
                              </p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Icon-over-Label Center Navigation */}
          <nav className="hidden lg:flex items-center gap-1 text-slate-600 dark:text-slate-300">
            {primaryNav.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectNav(item.id)}
                  className={`relative flex flex-col items-center gap-0.5 border-b-2 px-3 py-1.5 text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'border-[#0F5C4D] text-[#0F5C4D] dark:border-emerald-400 dark:text-emerald-400'
                      : 'border-transparent hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <span className="relative">
                    <Icon className="h-4 w-4" />
                    {item.badge && item.badge > 0 ? (
                      <span className="absolute -right-2 -top-1 rounded-full bg-[#0F5C4D] px-1 font-mono text-[10px] font-semibold leading-tight text-white tabular-nums">
                        {item.badge}
                      </span>
                    ) : null}
                  </span>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Right Controls: PWA Install (when available) + Profile Avatar Popup */}
          <div className="flex items-center gap-2 shrink-0">
            <PWAInstallButton />

            <div ref={profileMenuRef} className="relative hidden sm:block">
              <button
                type="button"
                onClick={() => setProfileMenuOpen((v) => !v)}
                className="flex flex-col items-center gap-0.5 rounded-lg px-2 py-1 text-[11px] font-medium text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
              >
                <div className="flex h-5 w-5 items-center justify-center overflow-hidden rounded-full bg-[#0F5C4D] text-[10px] font-bold text-white">
                  {profile?.avatarUrl ? (
                    <img
                      src={profile.avatarUrl}
                      alt={user.fullName}
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    user.fullName.charAt(0).toUpperCase()
                  )}
                </div>
                <span className="inline-flex items-center gap-0.5">
                  Me <ChevronDown className="h-3 w-3" />
                </span>
              </button>

              {profileMenuOpen && (
                <div className="absolute right-0 top-full z-40 mt-2 w-60 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
                  <div className="border-b border-slate-200 p-3.5 dark:border-slate-800">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#0F5C4D] text-sm font-bold text-white">
                        {profile?.avatarUrl ? (
                          <img
                            src={profile.avatarUrl}
                            alt={user.fullName}
                            referrerPolicy="no-referrer"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          user.fullName.charAt(0).toUpperCase()
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-slate-900 dark:text-white">
                          {user.fullName}
                        </p>
                        <p className="truncate text-[11px] text-slate-500">
                          {profile?.headline || 'Professional on ResuMind'}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setViewedProfileUserId(null);
                        setActiveTab('profile');
                        setProfileMenuOpen(false);
                      }}
                      className="mt-3 w-full rounded-lg border border-[#0F5C4D] py-1.5 text-xs font-medium text-[#0F5C4D] hover:bg-emerald-50 dark:border-emerald-400 dark:text-emerald-400 dark:hover:bg-slate-800"
                    >
                      View Profile
                    </button>
                  </div>

                  <div className="p-1.5 text-xs">
                    <button
                      type="button"
                      onClick={() => setDark((d) => !d)}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      {dark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
                      {dark ? 'Light Theme' : 'Dark Theme'}
                    </button>
                    <button
                      type="button"
                      onClick={logout}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-slate-800"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      Sign out
                    </button>
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setMobileMoreOpen(true)}
              className="rounded-lg border border-slate-200 p-2 text-slate-600 lg:hidden dark:border-slate-700 dark:text-slate-300"
              aria-label="Open navigation menu"
            >
              <Menu className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <div>
        {activeTab === 'home' && (
          <HomeFeed onNavigate={handleSelectNav} onViewProfile={handleViewProfile} />
        )}
        {activeTab === 'network' && (
          <NetworkView
            onOpenConversation={handleOpenConversation}
            onViewProfile={handleViewProfile}
          />
        )}
        {activeTab === 'jobs' && (
          <JobsView
            initialQuery={initialJobQuery}
            onClearInitialQuery={() => setInitialJobQuery('')}
          />
        )}
        {activeTab === 'messages' && (
          <MessagesView
            initialRecipientId={messageRecipientId}
            onClearInitialRecipient={() => setMessageRecipientId(null)}
          />
        )}
        {activeTab === 'notifications' && <NotificationsView onNavigate={handleSelectNav} />}
        {activeTab === 'profile' && (
          <ProfileView
            userId={viewedProfileUserId}
            onBackToMyProfile={() => setViewedProfileUserId(null)}
            onOpenConversation={handleOpenConversation}
            onViewProfile={handleViewProfile}
          />
        )}
        {activeTab === 'career' && <CareerStudioView />}
        {activeTab === 'employers' && <EmployerWorkspaceView />}
      </div>

      {/* Compact Mobile Bottom Nav */}
      <nav className="no-print fixed inset-x-0 bottom-0 z-30 flex items-center justify-around border-t border-slate-200 bg-white py-1.5 lg:hidden dark:border-slate-800 dark:bg-slate-900">
        {[
          { id: 'home' as AppTab, label: 'Home', icon: Home },
          { id: 'network' as AppTab, label: 'Network', icon: Users },
          { id: 'jobs' as AppTab, label: 'Jobs', icon: Briefcase },
          { id: 'messages' as AppTab, label: 'Messages', icon: MessageSquare },
          { id: 'career' as AppTab, label: 'Studio', icon: Sparkles },
        ].map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleSelectNav(item.id)}
              className={`flex flex-col items-center gap-0.5 px-2 py-1 text-[11px] font-medium ${
                active
                  ? 'text-[#0F5C4D] dark:text-emerald-400'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Mobile Secondary Menu Drawer */}
      {mobileMoreOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/50 lg:hidden">
          <div className="flex h-full w-72 flex-col justify-between bg-white p-5 dark:bg-slate-900">
            <div>
              <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
                <span className="font-display text-base font-bold text-slate-900 dark:text-white">
                  ResuMind
                </span>
                <button
                  type="button"
                  onClick={() => setMobileMoreOpen(false)}
                  className="rounded-lg p-1 text-slate-500"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-4 space-y-1">
                {allNavItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        handleSelectNav(item.id);
                        setMobileMoreOpen(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium ${
                        activeTab === item.id
                          ? 'bg-emerald-50 text-[#0F5C4D] dark:bg-slate-800 dark:text-emerald-400'
                          : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800'
                      }`}
                    >
                      <span className="flex items-center gap-2.5">
                        <Icon className="h-4 w-4" />
                        {item.label}
                      </span>
                      {item.badge ? (
                        <span className="font-mono text-xs tabular-nums">{item.badge}</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setDark((d) => !d)}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 py-2 text-xs font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200"
              >
                {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                {dark ? 'Light Theme' : 'Dark Theme'}
              </button>
              <button
                type="button"
                onClick={logout}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 py-2 text-xs font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}

      <OfflineIndicator />
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <AuthenticatedShell />
    </AuthProvider>
  );
}
