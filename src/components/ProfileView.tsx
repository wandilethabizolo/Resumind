import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Camera,
  Check,
  Download,
  Edit3,
  ExternalLink,
  MapPin,
  MessageSquare,
  Plus,
  Save,
  Shield,
  Trash2,
  UserCheck,
  UserPlus,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { readAndCompressImage } from '../lib/imageUpload';
import {
  AuthenticatedPostVideo,
  PostDownloadMenu,
  PostShareMenu,
} from '../lib/postMedia';
import { EducationItem, ExperienceItem, FeedPost, ReactionType, UserProfile } from '../types';
import { PostModal } from './PostModal';
import { PostReactionButton, ReactionSummary } from './ReactionPicker';

interface SessionRow {
  id: number;
  userAgent: string;
  ipAddress: string;
  mfaVerified: boolean;
  revoked: boolean;
  lastActiveAt: string;
  isCurrent: boolean;
}

interface ProfileMeta {
  isSelf: boolean;
  connectionsCount: number;
  connectionStatus: 'none' | 'pending_sent' | 'pending_received' | 'connected';
  connectionId: number | null;
  isFollowing: boolean;
}

interface ViewedProfile extends UserProfile {
  fullName: string;
  email?: string;
}

interface ProfileViewProps {
  userId?: number | null;
  onBackToMyProfile?: () => void;
  onOpenConversation?: (recipientId: number) => void;
  onViewProfile?: (userId: number) => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  userId,
  onBackToMyProfile,
  onOpenConversation,
  onViewProfile,
}) => {
  const { user, profile: myProfile, apiFetch, refreshSession, logout } = useAuth();
  const targetUserId = userId && userId > 0 ? userId : user?.id ?? null;
  const isSelf = !targetUserId || targetUserId === user?.id;

  const [subTab, setSubTab] = useState<'profile' | 'security'>('profile');
  const [viewedProfile, setViewedProfile] = useState<ViewedProfile | null>(null);
  const [meta, setMeta] = useState<ProfileMeta | null>(null);
  const [memberPosts, setMemberPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [privacyError, setPrivacyError] = useState('');
  const [statusMsg, setStatusMsg] = useState('');

  // Edit Profile modal state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [fullName, setFullName] = useState('');
  const [headline, setHeadline] = useState('');
  const [currentPosition, setCurrentPosition] = useState('');
  const [location, setLocation] = useState('Mbabane');
  const [country, setCountry] = useState('Eswatini');
  const [about, setAbout] = useState('');
  const [website, setWebsite] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'connections' | 'private'>('public');
  const [showEmail, setShowEmail] = useState(false);
  const [openToWork, setOpenToWork] = useState(true);
  const [skillsText, setSkillsText] = useState('');
  const [languagesText, setLanguagesText] = useState('');
  const [experiences, setExperiences] = useState<ExperienceItem[]>([]);
  const [education, setEducation] = useState<EducationItem[]>([]);
  const [saving, setSaving] = useState(false);

  // Post editing modal on profile
  const [editingPost, setEditingPost] = useState<FeedPost | null>(null);

  // Security tab sessions
  const [sessions, setSessions] = useState<SessionRow[]>([]);

  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);

  const loadProfileAndPosts = useCallback(async () => {
    if (!targetUserId) return;
    setLoading(true);
    setPrivacyError('');
    try {
      const [profileRes, postsRes] = await Promise.all([
        apiFetch<{ profile: ViewedProfile; meta: ProfileMeta }>(`/api/profiles/${targetUserId}`),
        apiFetch<{ posts: FeedPost[] }>(`/api/feed?authorId=${targetUserId}`),
      ]);
      setViewedProfile(profileRes.profile);
      setMeta(profileRes.meta);
      setMemberPosts(postsRes.posts || []);
    } catch (err: unknown) {
      setViewedProfile(null);
      setPrivacyError(err instanceof Error ? err.message : 'Unable to load profile');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, targetUserId]);

  useEffect(() => {
    setSubTab('profile');
    loadProfileAndPosts();
  }, [loadProfileAndPosts]);

  const populateEditForm = useCallback(() => {
    const srcProfile = isSelf ? myProfile : viewedProfile;
    const srcName = isSelf ? user?.fullName || '' : viewedProfile?.fullName || '';
    setFullName(srcName);
    setHeadline(srcProfile?.headline || '');
    setCurrentPosition(srcProfile?.currentPosition || '');
    setLocation(srcProfile?.location || 'Mbabane');
    setCountry(srcProfile?.country || 'Eswatini');
    setAbout(srcProfile?.about || '');
    setWebsite(srcProfile?.website || '');
    setAvatarUrl(srcProfile?.avatarUrl || '');
    setCoverUrl(srcProfile?.coverUrl || '');
    setVisibility(srcProfile?.visibility || 'public');
    setShowEmail(Boolean(srcProfile?.showEmail));
    setOpenToWork(Boolean(srcProfile?.openToWork));
    setSkillsText((srcProfile?.skills || []).join(', '));
    setLanguagesText((srcProfile?.languages || []).join(', '));
    setExperiences(srcProfile?.experiences || []);
    setEducation(srcProfile?.education || []);
  }, [isSelf, myProfile, user?.fullName, viewedProfile]);

  const openEditModal = () => {
    populateEditForm();
    setEditModalOpen(true);
  };

  const loadSessions = useCallback(async () => {
    const data = await apiFetch<{ sessions: SessionRow[] }>('/api/auth/sessions');
    setSessions(data.sessions || []);
  }, [apiFetch]);

  useEffect(() => {
    if (isSelf && subTab === 'security') {
      loadSessions();
    }
  }, [isSelf, loadSessions, subTab]);

  const handleImageUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    target: 'avatar' | 'cover'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await readAndCompressImage(
        file,
        target === 'cover' ? 1400 : 600,
        0.82
      );
      if (target === 'avatar') setAvatarUrl(compressed);
      else setCoverUrl(compressed);
    } catch (err: unknown) {
      setStatusMsg(err instanceof Error ? err.message : 'Unable to upload image');
    } finally {
      e.target.value = '';
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setStatusMsg('');
    try {
      await apiFetch('/api/profiles/me', {
        method: 'PUT',
        body: JSON.stringify({
          fullName,
          headline,
          currentPosition,
          location,
          country,
          about,
          website,
          avatarUrl,
          coverUrl,
          visibility,
          showEmail,
          openToWork,
          skills: skillsText
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          languages: languagesText
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          experiences,
          education,
        }),
      });
      await Promise.all([refreshSession(), loadProfileAndPosts()]);
      setEditModalOpen(false);
      setStatusMsg('Profile updated.');
    } catch (err: unknown) {
      setStatusMsg(err instanceof Error ? err.message : 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const handleConnect = async () => {
    if (!targetUserId) return;
    await apiFetch('/api/network/connect', {
      method: 'POST',
      body: JSON.stringify({ recipientId: targetUserId }),
    });
    await loadProfileAndPosts();
  };

  const handleAcceptInvite = async () => {
    if (!meta?.connectionId) return;
    await apiFetch(`/api/network/requests/${meta.connectionId}/respond`, {
      method: 'POST',
      body: JSON.stringify({ action: 'accept' }),
    });
    await loadProfileAndPosts();
  };

  const handleFollowToggle = async () => {
    if (!targetUserId) return;
    await apiFetch(`/api/network/follow/${targetUserId}`, { method: 'POST' });
    await loadProfileAndPosts();
  };

  const handleReaction = async (postId: number, type: ReactionType = 'like') => {
    const res = await apiFetch<{
      reacted: boolean;
      type: string | null;
      reactionCount: number;
      reactionBreakdown: Partial<Record<ReactionType, number>>;
    }>(`/api/feed/${postId}/react`, {
      method: 'POST',
      body: JSON.stringify({ type }),
    });
    setMemberPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? {
              ...p,
              userReaction: res.type,
              reactionCount: res.reactionCount,
              reactionBreakdown: res.reactionBreakdown,
            }
          : p
      )
    );
  };

  const handleDeletePost = async (postId: number) => {
    await apiFetch(`/api/feed/${postId}`, { method: 'DELETE' });
    await loadProfileAndPosts();
  };

  const handleExportData = async () => {
    const data = await apiFetch('/api/auth/export');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `resumind-data-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRevokeSession = async (id: number) => {
    await apiFetch(`/api/auth/sessions/${id}/revoke`, { method: 'POST' });
    await loadSessions();
  };

  const handleRevokeOthers = async () => {
    await apiFetch('/api/auth/sessions/revoke-others', { method: 'POST' });
    await loadSessions();
  };

  const handleDeleteAccount = async () => {
    await apiFetch('/api/auth/account', { method: 'DELETE' });
    await logout();
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6">
        <div className="h-56 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" />
      </div>
    );
  }

  if (privacyError || !viewedProfile) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 px-4 py-6">
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
          <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
            {privacyError || 'Profile unavailable'}
          </p>
          {onBackToMyProfile && (
            <button
              type="button"
              onClick={onBackToMyProfile}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[#0F5C4D] px-4 py-2 text-xs font-medium text-white hover:bg-[#0c4a3e]"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to My Profile
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5 px-4 py-6">
      {!isSelf && onBackToMyProfile && (
        <button
          type="button"
          onClick={onBackToMyProfile}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-[#0F5C4D] dark:text-slate-400 dark:hover:text-emerald-400"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to my profile
        </button>
      )}

      {/* LinkedIn-style Read-Only Header Card */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="h-32 w-full bg-gradient-to-r from-[#0F5C4D]/20 via-slate-100 to-slate-50 dark:from-emerald-950/60 dark:via-slate-900 dark:to-slate-900">
          {viewedProfile.coverUrl && (
            <img
              src={viewedProfile.coverUrl}
              alt="Profile cover"
              referrerPolicy="no-referrer"
              className="h-full w-full object-cover"
            />
          )}
        </div>

        <div className="px-6 pb-6">
          <div className="-mt-12 flex flex-wrap items-end justify-between gap-4">
            <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-[#0F5C4D] text-2xl font-bold text-white shadow-sm dark:border-slate-900">
              {viewedProfile.avatarUrl ? (
                <img
                  src={viewedProfile.avatarUrl}
                  alt={viewedProfile.fullName}
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover"
                />
              ) : (
                (viewedProfile.fullName || 'R').charAt(0).toUpperCase()
              )}
            </div>

            {isSelf ? (
              <div className="flex flex-wrap items-center gap-2 pt-3">
                <button
                  type="button"
                  onClick={openEditModal}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F5C4D] px-4 py-2 text-xs font-medium text-white hover:bg-[#0c4a3e]"
                >
                  <Edit3 className="h-3.5 w-3.5" />
                  Edit Profile
                </button>
                <button
                  type="button"
                  onClick={() => setSubTab((t) => (t === 'profile' ? 'security' : 'profile'))}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium ${
                    subTab === 'security'
                      ? 'border-[#0F5C4D] bg-emerald-50 text-[#0F5C4D] dark:border-emerald-500 dark:bg-slate-800 dark:text-emerald-400'
                      : 'border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800'
                  }`}
                >
                  <Shield className="h-3.5 w-3.5" />
                  {subTab === 'security' ? 'View Profile' : 'Sessions & Privacy'}
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2 pt-3">
                {meta?.connectionStatus === 'none' && (
                  <button
                    type="button"
                    onClick={handleConnect}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F5C4D] px-4 py-2 text-xs font-medium text-white hover:bg-[#0c4a3e]"
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    Connect
                  </button>
                )}
                {meta?.connectionStatus === 'pending_sent' && (
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 dark:border-slate-700 dark:text-slate-300">
                    Invitation Sent
                  </span>
                )}
                {meta?.connectionStatus === 'pending_received' && (
                  <button
                    type="button"
                    onClick={handleAcceptInvite}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F5C4D] px-4 py-2 text-xs font-medium text-white hover:bg-[#0c4a3e]"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Accept Invitation
                  </button>
                )}
                {meta?.connectionStatus === 'connected' && (
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-[#0F5C4D] dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-400">
                    <UserCheck className="h-3.5 w-3.5" />
                    Connected
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleFollowToggle}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  {meta?.isFollowing ? 'Following' : 'Follow'}
                </button>
                {onOpenConversation && targetUserId && meta?.connectionStatus === 'connected' && (
                  <button
                    type="button"
                    onClick={() => onOpenConversation(targetUserId)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    Message
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="mt-4">
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">
              {viewedProfile.fullName}
            </h1>
            <p className="mt-0.5 text-sm text-slate-700 dark:text-slate-300">
              {viewedProfile.headline || viewedProfile.currentPosition || 'Professional on ResuMind'}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {viewedProfile.location}, {viewedProfile.country}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                {meta?.connectionsCount ?? 0} connections
              </span>
              {viewedProfile.openToWork && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-medium text-[#0F5C4D] dark:text-emerald-400">
                    Open to opportunities
                  </span>
                </>
              )}
              {viewedProfile.website && (
                <>
                  <span aria-hidden="true">·</span>
                  <a
                    href={viewedProfile.website}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[#0F5C4D] hover:underline dark:text-emerald-400"
                  >
                    Website <ExternalLink className="h-3 w-3" />
                  </a>
                </>
              )}
              {viewedProfile.email && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{viewedProfile.email}</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {statusMsg && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
          {statusMsg}
        </div>
      )}

      {isSelf && subTab === 'security' ? (
        <div className="space-y-6">
          <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-3 dark:border-slate-800">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                  Active Sessions
                </h2>
                <p className="text-xs text-slate-500">
                  Revoke access from browsers or devices you no longer recognize.
                </p>
              </div>
              <button
                type="button"
                onClick={handleRevokeOthers}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
              >
                Revoke Other Sessions
              </button>
            </div>
            <div className="mt-3 divide-y divide-slate-200 dark:divide-slate-800">
              {sessions.map((s) => (
                <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-xs">
                  <div>
                    <p className="font-medium text-slate-900 dark:text-white">
                      {s.isCurrent ? 'Current Session' : 'Browser Session'} ·{' '}
                      <span className="font-mono">{s.ipAddress || 'unknown IP'}</span>
                    </p>
                    <p className="mt-0.5 max-w-xl truncate text-slate-500">{s.userAgent}</p>
                    <p className="mt-0.5 font-mono text-slate-400 tabular-nums">
                      Last active: {new Date(s.lastActiveAt).toLocaleString()} ·{' '}
                      {s.revoked ? 'Revoked' : 'Active'}
                    </p>
                  </div>
                  {!s.revoked && !s.isCurrent && (
                    <button
                      type="button"
                      onClick={() => handleRevokeSession(s.id)}
                      className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-400"
                    >
                      Revoke
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Data Export & Account Control
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Download your ResuMind data in JSON format or permanently delete your account.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleExportData}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
              >
                <Download className="h-3.5 w-3.5" />
                Download My Data (JSON)
              </button>
              <button
                type="button"
                onClick={handleDeleteAccount}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 px-4 py-2 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete Account
              </button>
            </div>
          </section>
        </div>
      ) : (
        <div className="space-y-5">
          {/* About */}
          <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">About</h2>
            {viewedProfile.about ? (
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                {viewedProfile.about}
              </p>
            ) : (
              <p className="mt-2 text-xs text-slate-500">
                {isSelf
                  ? 'Add a brief summary of your background and career focus via Edit Profile.'
                  : 'No summary added yet.'}
              </p>
            )}
          </section>

          {/* Experience */}
          <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Experience</h2>
            {viewedProfile.experiences.length === 0 ? (
              <p className="mt-2 text-xs text-slate-500">
                {isSelf
                  ? 'No work experience added yet. Click Edit Profile to list your roles.'
                  : 'No roles listed.'}
              </p>
            ) : (
              <div className="mt-3 divide-y divide-slate-200 dark:divide-slate-800">
                {viewedProfile.experiences.map((exp) => (
                  <div key={exp.id} className="py-3 first:pt-0 last:pb-0">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                      {exp.title}
                    </h3>
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      {exp.company}
                      {(exp.startDate || exp.endDate) && (
                        <span className="font-normal text-slate-500">
                          {' · '}
                          {exp.startDate} – {exp.endDate || 'Present'}
                        </span>
                      )}
                    </p>
                    {exp.description && (
                      <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                        {exp.description}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Education */}
          {viewedProfile.education.length > 0 && (
            <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">Education</h2>
              <div className="mt-3 divide-y divide-slate-200 dark:divide-slate-800">
                {viewedProfile.education.map((edu) => (
                  <div key={edu.id} className="py-3 first:pt-0 last:pb-0">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                      {edu.institution}
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      {edu.degree}
                      {edu.endYear && ` · ${edu.endYear}`}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Skills & Languages */}
          {(viewedProfile.skills.length > 0 || viewedProfile.languages.length > 0) && (
            <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Skills & Languages
              </h2>
              {viewedProfile.skills.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-medium text-slate-500">Skills</p>
                  <p className="mt-1 text-sm text-slate-800 dark:text-slate-200">
                    {viewedProfile.skills.join(' · ')}
                  </p>
                </div>
              )}
              {viewedProfile.languages.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-medium text-slate-500">Languages</p>
                  <p className="mt-1 text-sm text-slate-800 dark:text-slate-200">
                    {viewedProfile.languages.join(' · ')}
                  </p>
                </div>
              )}
            </section>
          )}

          {/* Member Activity / Posts */}
          <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">Posts</h2>
              <span className="font-mono text-xs text-slate-500 tabular-nums">
                {memberPosts.length}
              </span>
            </div>
            {memberPosts.length === 0 ? (
              <p className="mt-3 text-xs text-slate-500">No posts published yet.</p>
            ) : (
              <div className="mt-3 divide-y divide-slate-200 dark:divide-slate-800">
                {memberPosts.map((post) => (
                  <article key={post.id} className="py-4 first:pt-1 last:pb-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <button
                          type="button"
                          onClick={() => onViewProfile?.(post.authorId)}
                          className="font-semibold text-slate-900 hover:underline dark:text-white"
                        >
                          {post.authorName}
                        </button>
                        <span aria-hidden="true">·</span>
                        <span>{post.topic}</span>
                        <span aria-hidden="true">·</span>
                        <time className="font-mono tabular-nums">
                          {new Date(post.createdAt).toLocaleDateString()}
                        </time>
                      </div>
                      {isSelf && (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setEditingPost(post)}
                            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                            aria-label="Edit post"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeletePost(post.id)}
                            className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-slate-800"
                            aria-label="Delete post"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-800 dark:text-slate-200">
                      {post.content}
                    </p>
                    {post.imageUrl && (
                      <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
                        <img
                          src={post.imageUrl}
                          alt="Post media"
                          referrerPolicy="no-referrer"
                          className="max-h-72 w-full object-cover"
                        />
                      </div>
                    )}
                    {post.videoUrl && (
                      <AuthenticatedPostVideo
                        videoUrl={post.videoUrl}
                        durationSeconds={post.videoDurationSeconds}
                      />
                    )}
                    <ReactionSummary
                      reactionCount={post.reactionCount}
                      reactionBreakdown={post.reactionBreakdown}
                    />
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                      <div className="flex items-center gap-4">
                        <PostReactionButton
                          userReaction={post.userReaction}
                          reactionCount={post.reactionCount}
                          onReact={(type) => handleReaction(post.id, type)}
                        />
                        <span className="inline-flex items-center gap-1">
                          <MessageSquare className="h-3.5 w-3.5" />
                          <span className="font-mono tabular-nums">{post.commentCount}</span>
                        </span>
                        <PostShareMenu post={post} />
                      </div>
                      <PostDownloadMenu post={post} />
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* Clean EditProfileModal */}
      {editModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget && !saving) setEditModalOpen(false);
          }}
        >
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Edit Profile
              </h2>
              <button
                type="button"
                onClick={() => setEditModalOpen(false)}
                disabled={saving}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveProfile} className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Photo & Cover Upload */}
              <div className="flex flex-wrap items-center gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-[#0F5C4D] text-lg font-bold text-white">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
                    ) : (
                      (fullName || 'R').charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => avatarInputRef.current?.click()}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
                    >
                      <Camera className="h-3.5 w-3.5" />
                      Upload avatar
                    </button>
                    {avatarUrl && (
                      <button
                        type="button"
                        onClick={() => setAvatarUrl('')}
                        className="text-left text-[11px] text-red-600 hover:underline"
                      >
                        Remove avatar
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => coverInputRef.current?.click()}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
                  >
                    <Camera className="h-3.5 w-3.5" />
                    Upload cover banner
                  </button>
                  {coverUrl && (
                    <button
                      type="button"
                      onClick={() => setCoverUrl('')}
                      className="text-xs text-red-600 hover:underline"
                    >
                      Remove cover
                    </button>
                  )}
                </div>

                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => handleImageUpload(e, 'avatar')}
                  className="hidden"
                />
                <input
                  ref={coverInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => handleImageUpload(e, 'cover')}
                  className="hidden"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Headline
                  </label>
                  <input
                    type="text"
                    value={headline}
                    onChange={(e) => setHeadline(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Current Role
                  </label>
                  <input
                    type="text"
                    value={currentPosition}
                    onChange={(e) => setCurrentPosition(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      City
                    </label>
                    <input
                      type="text"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Country
                    </label>
                    <input
                      type="text"
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                    />
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    About
                  </label>
                  <textarea
                    rows={3}
                    value={about}
                    onChange={(e) => setAbout(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Skills (comma separated)
                  </label>
                  <input
                    type="text"
                    value={skillsText}
                    onChange={(e) => setSkillsText(e.target.value)}
                    placeholder="TypeScript, PostgreSQL, Finance"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Languages
                  </label>
                  <input
                    type="text"
                    value={languagesText}
                    onChange={(e) => setLanguagesText(e.target.value)}
                    placeholder="English, siSwati"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Website
                  </label>
                  <input
                    type="url"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Visibility
                  </label>
                  <select
                    value={visibility}
                    onChange={(e) =>
                      setVisibility(e.target.value as 'public' | 'connections' | 'private')
                    }
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                  >
                    <option value="public">Public</option>
                    <option value="connections">Connections only</option>
                    <option value="private">Private</option>
                  </select>
                </div>
                <div className="flex flex-wrap items-center gap-6 sm:col-span-2">
                  <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={openToWork}
                      onChange={(e) => setOpenToWork(e.target.checked)}
                      className="rounded border-slate-300"
                    />
                    Open to career opportunities
                  </label>
                  <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={showEmail}
                      onChange={(e) => setShowEmail(e.target.checked)}
                      className="rounded border-slate-300"
                    />
                    Show email on profile
                  </label>
                </div>
              </div>

              {/* Experience & Education inside modal */}
              <div className="border-t border-slate-200 pt-4 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Experience & Education
                  </h3>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setExperiences((prev) => [
                          ...prev,
                          {
                            id: `exp-${Date.now()}`,
                            title: '',
                            company: '',
                            location: '',
                            startDate: '',
                            endDate: '',
                            current: false,
                            description: '',
                          },
                        ])
                      }
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium dark:border-slate-700"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Role
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setEducation((prev) => [
                          ...prev,
                          {
                            id: `edu-${Date.now()}`,
                            institution: '',
                            degree: '',
                            field: '',
                            startYear: '',
                            endYear: '',
                            description: '',
                          },
                        ])
                      }
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium dark:border-slate-700"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Education
                    </button>
                  </div>
                </div>

                {experiences.map((exp, idx) => (
                  <div
                    key={exp.id}
                    className="mt-3 grid grid-cols-1 gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-2 dark:border-slate-800"
                  >
                    <input
                      type="text"
                      placeholder="Role Title"
                      value={exp.title}
                      onChange={(e) => {
                        const next = [...experiences];
                        next[idx] = { ...exp, title: e.target.value };
                        setExperiences(next);
                      }}
                      className="rounded border border-slate-300 px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
                    />
                    <input
                      type="text"
                      placeholder="Organization"
                      value={exp.company}
                      onChange={(e) => {
                        const next = [...experiences];
                        next[idx] = { ...exp, company: e.target.value };
                        setExperiences(next);
                      }}
                      className="rounded border border-slate-300 px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
                    />
                    <input
                      type="text"
                      placeholder="Start (e.g. 2022)"
                      value={exp.startDate}
                      onChange={(e) => {
                        const next = [...experiences];
                        next[idx] = { ...exp, startDate: e.target.value };
                        setExperiences(next);
                      }}
                      className="rounded border border-slate-300 px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
                    />
                    <input
                      type="text"
                      placeholder="End (or Present)"
                      value={exp.endDate}
                      onChange={(e) => {
                        const next = [...experiences];
                        next[idx] = { ...exp, endDate: e.target.value };
                        setExperiences(next);
                      }}
                      className="rounded border border-slate-300 px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
                    />
                    <textarea
                      rows={2}
                      placeholder="Impact & responsibilities..."
                      value={exp.description}
                      onChange={(e) => {
                        const next = [...experiences];
                        next[idx] = { ...exp, description: e.target.value };
                        setExperiences(next);
                      }}
                      className="rounded border border-slate-300 px-2.5 py-1.5 text-xs sm:col-span-2 dark:border-slate-700 dark:bg-slate-950"
                    />
                    <div className="sm:col-span-2 flex justify-end">
                      <button
                        type="button"
                        onClick={() => setExperiences((prev) => prev.filter((_, i) => i !== idx))}
                        className="text-xs text-red-600 hover:underline"
                      >
                        Remove Role
                      </button>
                    </div>
                  </div>
                ))}

                {education.map((edu, idx) => (
                  <div
                    key={edu.id}
                    className="mt-3 grid grid-cols-1 gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-3 dark:border-slate-800"
                  >
                    <input
                      type="text"
                      placeholder="Institution"
                      value={edu.institution}
                      onChange={(e) => {
                        const next = [...education];
                        next[idx] = { ...edu, institution: e.target.value };
                        setEducation(next);
                      }}
                      className="rounded border border-slate-300 px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
                    />
                    <input
                      type="text"
                      placeholder="Degree & Field"
                      value={edu.degree}
                      onChange={(e) => {
                        const next = [...education];
                        next[idx] = { ...edu, degree: e.target.value };
                        setEducation(next);
                      }}
                      className="rounded border border-slate-300 px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
                    />
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Years"
                        value={edu.endYear}
                        onChange={(e) => {
                          const next = [...education];
                          next[idx] = { ...edu, endYear: e.target.value };
                          setEducation(next);
                        }}
                        className="flex-1 rounded border border-slate-300 px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
                      />
                      <button
                        type="button"
                        onClick={() => setEducation((prev) => prev.filter((_, i) => i !== idx))}
                        className="text-xs text-red-600"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditModalOpen(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 dark:border-slate-700 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F5C4D] px-5 py-2 text-xs font-medium text-white hover:bg-[#0c4a3e] disabled:opacity-50"
                >
                  <Save className="h-3.5 w-3.5" />
                  {saving ? 'Saving...' : 'Save Profile'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingPost && (
        <PostModal
          isOpen={Boolean(editingPost)}
          onClose={() => setEditingPost(null)}
          authorName={user?.fullName || 'Member'}
          authorAvatar={myProfile?.avatarUrl}
          initialPost={editingPost}
          onSubmit={async (payload) => {
            await apiFetch(`/api/feed/${editingPost.id}`, {
              method: 'PATCH',
              body: JSON.stringify(payload),
            });
            await loadProfileAndPosts();
          }}
        />
      )}
    </div>
  );
};
