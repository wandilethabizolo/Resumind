import React, { useCallback, useEffect, useState } from 'react';
import {
  Award,
  Bookmark,
  CheckCircle2,
  Edit3,
  Flag,
  Heart,
  ImagePlus,
  MessageSquare,
  Repeat2,
  Trash2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { AppTab, FeedPost } from '../types';
import { PostModal } from './PostModal';
import { ReportModal } from './ReportModal';

interface CommentRow {
  id: number;
  postId: number;
  authorId: number;
  parentId: number | null;
  content: string;
  authorName: string;
  authorHeadline: string;
  authorAvatar: string;
  createdAt: string;
}

interface HomeFeedProps {
  onNavigate: (tab: AppTab) => void;
  onViewProfile: (userId: number) => void;
}

export const HomeFeed: React.FC<HomeFeedProps> = ({ onNavigate, onViewProfile }) => {
  const { user, profile, apiFetch } = useAuth();
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [trendingTopics, setTrendingTopics] = useState<Array<{ topic: string; count: number }>>([]);
  const [suggestedOrgs, setSuggestedOrgs] = useState<
    Array<{ id: number; name: string; industry: string; location: string; country: string; verified: boolean }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [activeTopic, setActiveTopic] = useState('');
  const [savedOnly, setSavedOnly] = useState(false);

  // Modal composer state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalFocusMedia, setModalFocusMedia] = useState(false);
  const [modalPostType, setModalPostType] = useState<'update' | 'achievement' | 'article'>('update');
  const [editingPost, setEditingPost] = useState<FeedPost | null>(null);

  // Comments & reporting state
  const [openCommentsPostId, setOpenCommentsPostId] = useState<number | null>(null);
  const [commentsByPost, setCommentsByPost] = useState<Record<number, CommentRow[]>>({});
  const [commentInput, setCommentInput] = useState<Record<number, string>>({});
  const [replyParentId, setReplyParentId] = useState<number | null>(null);
  const [reportTarget, setReportTarget] = useState<{ id: number; label: string } | null>(null);
  const [error, setError] = useState('');

  const loadFeed = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (activeTopic) qs.set('topic', activeTopic);
      if (savedOnly) qs.set('saved', 'true');
      const data = await apiFetch<{
        posts: FeedPost[];
        trendingTopics: Array<{ topic: string; count: number }>;
        suggestedOrganizations: Array<{
          id: number;
          name: string;
          industry: string;
          location: string;
          country: string;
          verified: boolean;
        }>;
      }>(`/api/feed?${qs.toString()}`);
      setPosts(data.posts || []);
      setTrendingTopics(data.trendingTopics || []);
      setSuggestedOrgs(data.suggestedOrganizations || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to load feed');
    } finally {
      setLoading(false);
    }
  }, [activeTopic, apiFetch, savedOnly]);

  useEffect(() => {
    loadFeed();
  }, [loadFeed]);

  const openCreateModal = (opts?: {
    focusMedia?: boolean;
    postType?: 'update' | 'achievement' | 'article';
  }) => {
    setEditingPost(null);
    setModalFocusMedia(Boolean(opts?.focusMedia));
    setModalPostType(opts?.postType || 'update');
    setModalOpen(true);
  };

  const openEditModal = (post: FeedPost) => {
    setEditingPost(post);
    setModalFocusMedia(false);
    setModalOpen(true);
  };

  const handleModalSubmit = async (payload: {
    content: string;
    topic: string;
    postType: 'update' | 'achievement' | 'article';
    visibility: 'public' | 'connections';
    imageUrl: string | null;
  }) => {
    if (editingPost) {
      await apiFetch(`/api/feed/${editingPost.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
    } else {
      await apiFetch('/api/feed', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    }
    await loadFeed();
  };

  const handleReaction = async (postId: number) => {
    try {
      await apiFetch(`/api/feed/${postId}/react`, {
        method: 'POST',
        body: JSON.stringify({ type: 'like' }),
      });
      await loadFeed();
    } catch {
      // ignore
    }
  };

  const handleSave = async (postId: number) => {
    try {
      await apiFetch(`/api/feed/${postId}/save`, { method: 'POST' });
      await loadFeed();
    } catch {
      // ignore
    }
  };

  const handleRepost = async (post: FeedPost) => {
    try {
      await apiFetch('/api/feed', {
        method: 'POST',
        body: JSON.stringify({
          content: `Reposted from ${post.authorName}: ${post.content}`,
          topic: post.topic,
          postType: 'repost',
          repostOfId: post.id,
          visibility: 'public',
        }),
      });
      await loadFeed();
    } catch {
      // ignore
    }
  };

  const handleDeletePost = async (postId: number) => {
    await apiFetch(`/api/feed/${postId}`, { method: 'DELETE' });
    await loadFeed();
  };

  const toggleComments = async (postId: number) => {
    if (openCommentsPostId === postId) {
      setOpenCommentsPostId(null);
      return;
    }
    setOpenCommentsPostId(postId);
    const data = await apiFetch<{ comments: CommentRow[] }>(`/api/feed/${postId}/comments`);
    setCommentsByPost((prev) => ({ ...prev, [postId]: data.comments || [] }));
  };

  const handleAddComment = async (postId: number) => {
    const text = (commentInput[postId] || '').trim();
    if (!text) return;
    await apiFetch(`/api/feed/${postId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content: text, parentId: replyParentId }),
    });
    setCommentInput((prev) => ({ ...prev, [postId]: '' }));
    setReplyParentId(null);
    const data = await apiFetch<{ comments: CommentRow[] }>(`/api/feed/${postId}/comments`);
    setCommentsByPost((prev) => ({ ...prev, [postId]: data.comments || [] }));
    await loadFeed();
  };

  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 py-6 lg:grid-cols-12">
      {/* Left Rail: Profile Card & Live Widgets */}
      <aside className="space-y-4 lg:col-span-4">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="h-14 w-full bg-gradient-to-r from-[#0F5C4D]/20 via-slate-100 to-slate-50 dark:from-emerald-950/60 dark:via-slate-900 dark:to-slate-900">
            {profile?.coverUrl && (
              <img
                src={profile.coverUrl}
                alt="Cover banner"
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
              />
            )}
          </div>
          <div className="px-4 pb-4">
            <button
              type="button"
              onClick={() => user && onViewProfile(user.id)}
              className="-mt-7 flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-[#0F5C4D] text-lg font-bold text-white dark:border-slate-900"
            >
              {profile?.avatarUrl ? (
                <img
                  src={profile.avatarUrl}
                  alt={user?.fullName || 'Profile'}
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover"
                />
              ) : (
                (user?.fullName || 'R').charAt(0).toUpperCase()
              )}
            </button>

            <button
              type="button"
              onClick={() => user && onViewProfile(user.id)}
              className="mt-2 block text-left text-base font-semibold text-slate-900 hover:text-[#0F5C4D] hover:underline dark:text-white dark:hover:text-emerald-400"
            >
              {user?.fullName}
            </button>
            <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
              {profile?.headline || 'Add your professional headline'}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {profile?.location || 'Mbabane'}, {profile?.country || 'Eswatini'}
            </p>

            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-slate-200 pt-3 text-xs dark:border-slate-800">
              <button
                type="button"
                onClick={() => user && onViewProfile(user.id)}
                className="font-medium text-[#0F5C4D] hover:underline dark:text-emerald-400"
              >
                View Profile
              </button>
              <button
                type="button"
                onClick={() => setSavedOnly((v) => !v)}
                className="font-medium text-slate-700 hover:underline dark:text-slate-300"
              >
                {savedOnly ? 'All Posts' : 'Saved Posts'}
              </button>
              <button
                type="button"
                onClick={() => onNavigate('employers')}
                className="font-medium text-slate-700 hover:underline dark:text-slate-300"
              >
                Post a Job
              </button>
            </div>
          </div>
        </div>

        {trendingTopics.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Active Topics
            </h3>
            <div className="mt-2 divide-y divide-slate-200 dark:divide-slate-800">
              {trendingTopics.map((item) => (
                <button
                  key={item.topic}
                  type="button"
                  onClick={() => setActiveTopic(item.topic)}
                  className="flex w-full items-center justify-between py-2 text-left text-xs hover:text-[#0F5C4D] dark:hover:text-emerald-400"
                >
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    {item.topic}
                  </span>
                  <span className="font-mono text-slate-500 tabular-nums">{item.count}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {suggestedOrgs.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Organizations
              </h3>
              <button
                type="button"
                onClick={() => onNavigate('jobs')}
                className="text-xs font-medium text-[#0F5C4D] hover:underline dark:text-emerald-400"
              >
                Jobs
              </button>
            </div>
            <div className="mt-2 divide-y divide-slate-200 dark:divide-slate-800">
              {suggestedOrgs.map((org) => (
                <div key={org.id} className="py-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-slate-900 dark:text-white">
                      {org.name}
                    </span>
                    {org.verified && (
                      <CheckCircle2 className="h-3.5 w-3.5 text-[#0F5C4D] dark:text-emerald-400" />
                    )}
                  </div>
                  <p className="text-xs text-slate-500">
                    {org.industry} · {org.location}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </aside>

      {/* Main Feed Column */}
      <main className="space-y-4 lg:col-span-8">
        {/* Clean LinkedIn-style PostUpdate trigger card */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => user && onViewProfile(user.id)}
              className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#0F5C4D] text-sm font-bold text-white"
            >
              {profile?.avatarUrl ? (
                <img
                  src={profile.avatarUrl}
                  alt={user?.fullName || 'Profile'}
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover"
                />
              ) : (
                (user?.fullName || 'R').charAt(0).toUpperCase()
              )}
            </button>
            <button
              type="button"
              onClick={() => openCreateModal()}
              className="flex-1 rounded-full border border-slate-300 bg-slate-50 px-4 py-2.5 text-left text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Start a post
            </button>
          </div>

          <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-2.5 dark:border-slate-800">
            <button
              type="button"
              onClick={() => openCreateModal({ focusMedia: true })}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <ImagePlus className="h-4 w-4 text-[#0F5C4D] dark:text-emerald-400" />
              Photo
            </button>
            <button
              type="button"
              onClick={() => openCreateModal({ postType: 'achievement' })}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Award className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              Milestone
            </button>
          </div>

          {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
        </div>

        {(activeTopic || savedOnly) && (
          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
            <span>Filtering by: {savedOnly ? 'Saved Posts' : activeTopic}</span>
            <button
              type="button"
              onClick={() => {
                setActiveTopic('');
                setSavedOnly(false);
              }}
              className="font-medium text-[#0F5C4D] hover:underline dark:text-emerald-400"
            >
              Clear filter
            </button>
          </div>
        )}

        {loading ? (
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="h-32 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
              />
            ))}
          </div>
        ) : posts.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
              {savedOnly ? 'No saved posts yet.' : 'Your feed is quiet.'}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {savedOnly
                ? 'Bookmark any post to return to it here.'
                : 'Start a post above or connect with colleagues in Network.'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {posts.map((post) => {
              const isOwn = post.authorId === user?.id;
              return (
                <article
                  key={post.id}
                  className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        onClick={() => onViewProfile(post.authorId)}
                        className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-200 text-sm font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                      >
                        {post.authorAvatar ? (
                          <img
                            src={post.authorAvatar}
                            alt={post.authorName}
                            referrerPolicy="no-referrer"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          post.authorName.charAt(0).toUpperCase()
                        )}
                      </button>
                      <div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onViewProfile(post.authorId)}
                            className="text-left text-sm font-semibold text-slate-900 hover:text-[#0F5C4D] hover:underline dark:text-white dark:hover:text-emerald-400"
                          >
                            {post.authorName}
                          </button>
                          {post.organization && (
                            <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                              <span aria-hidden="true">·</span>
                              {post.organization.name}
                              {post.organization.verified && (
                                <CheckCircle2 className="h-3.5 w-3.5 text-[#0F5C4D] dark:text-emerald-400" />
                              )}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {post.authorHeadline}
                        </p>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-400">
                          <span>{post.topic}</span>
                          <span aria-hidden="true">·</span>
                          <time className="font-mono tabular-nums">
                            {new Date(post.createdAt).toLocaleDateString()}
                          </time>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      {isOwn ? (
                        <>
                          <button
                            type="button"
                            onClick={() => openEditModal(post)}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                            aria-label="Edit post"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeletePost(post.id)}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-slate-800"
                            aria-label="Delete post"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setReportTarget({ id: post.id, label: 'post' })}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                          aria-label="Report post"
                        >
                          <Flag className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-800 dark:text-slate-200">
                    {post.content}
                  </p>

                  {post.imageUrl && (
                    <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
                      <img
                        src={post.imageUrl}
                        alt="Post attachment"
                        referrerPolicy="no-referrer"
                        className="max-h-96 w-full object-cover"
                      />
                    </div>
                  )}

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-2.5 text-xs dark:border-slate-800">
                    <div className="flex items-center gap-4">
                      <button
                        type="button"
                        onClick={() => handleReaction(post.id)}
                        className={`inline-flex items-center gap-1.5 font-medium transition-colors ${
                          post.userReaction
                            ? 'text-[#0F5C4D] dark:text-emerald-400'
                            : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                        }`}
                      >
                        <Heart className="h-3.5 w-3.5" />
                        <span className="font-mono tabular-nums">{post.reactionCount}</span>
                        <span>Like</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleComments(post.id)}
                        className="inline-flex items-center gap-1.5 font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                      >
                        <MessageSquare className="h-3.5 w-3.5" />
                        <span className="font-mono tabular-nums">{post.commentCount}</span>
                        <span>Comments</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRepost(post)}
                        className="inline-flex items-center gap-1.5 font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                      >
                        <Repeat2 className="h-3.5 w-3.5" />
                        <span>Repost</span>
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSave(post.id)}
                      className={`inline-flex items-center gap-1 font-medium ${
                        post.isSaved
                          ? 'text-[#0F5C4D] dark:text-emerald-400'
                          : 'text-slate-500 hover:text-slate-900 dark:text-slate-400'
                      }`}
                    >
                      <Bookmark className="h-3.5 w-3.5" />
                      <span>{post.isSaved ? 'Saved' : 'Save'}</span>
                    </button>
                  </div>

                  {openCommentsPostId === post.id && (
                    <div className="mt-3 space-y-3 border-t border-slate-200 pt-3 dark:border-slate-800">
                      {(commentsByPost[post.id] || []).map((c) => (
                        <div
                          key={c.id}
                          className={`text-xs ${c.parentId ? 'ml-6 border-l border-slate-200 pl-3 dark:border-slate-700' : ''}`}
                        >
                          <div className="flex items-center justify-between">
                            <button
                              type="button"
                              onClick={() => onViewProfile(c.authorId)}
                              className="font-semibold text-slate-900 hover:text-[#0F5C4D] hover:underline dark:text-white dark:hover:text-emerald-400"
                            >
                              {c.authorName}
                            </button>
                            <button
                              type="button"
                              onClick={() => setReplyParentId(c.id)}
                              className="text-slate-500 hover:text-[#0F5C4D]"
                            >
                              Reply
                            </button>
                          </div>
                          <p className="mt-0.5 text-slate-700 dark:text-slate-300">{c.content}</p>
                        </div>
                      ))}
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={commentInput[post.id] || ''}
                          onChange={(e) =>
                            setCommentInput((prev) => ({ ...prev, [post.id]: e.target.value }))
                          }
                          placeholder={replyParentId ? 'Write a reply...' : 'Add a comment...'}
                          className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
                        />
                        <button
                          type="button"
                          onClick={() => handleAddComment(post.id)}
                          className="rounded-lg bg-[#0F5C4D] px-3 py-1.5 text-xs font-medium text-white"
                        >
                          Send
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </main>

      <PostModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingPost(null);
        }}
        authorName={user?.fullName || 'Member'}
        authorAvatar={profile?.avatarUrl}
        initialPost={editingPost}
        initialFocusMedia={modalFocusMedia}
        initialPostType={modalPostType}
        onSubmit={handleModalSubmit}
      />

      {reportTarget && (
        <ReportModal
          targetType="post"
          targetId={reportTarget.id}
          label={reportTarget.label}
          onClose={() => setReportTarget(null)}
        />
      )}
    </div>
  );
};
