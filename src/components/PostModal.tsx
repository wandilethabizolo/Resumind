import React, { useEffect, useRef, useState } from 'react';
import { Award, FileText, Film, ImagePlus, Link2, Send, Trash2, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { readAndCompressImage } from '../lib/imageUpload';
import { AuthenticatedPostVideo, formatVideoDuration } from '../lib/postMedia';
import { FeedPost } from '../types';

const MAX_VIDEO_SECONDS = 180;
const MAX_VIDEO_BYTES = 65 * 1024 * 1024;

interface PostModalProps {
  isOpen: boolean;
  onClose: () => void;
  authorName: string;
  authorAvatar?: string;
  initialPost?: FeedPost | null;
  initialFocusMedia?: boolean;
  initialFocusVideo?: boolean;
  initialPostType?: 'update' | 'achievement' | 'article';
  onSubmit: (payload: {
    content: string;
    topic: string;
    postType: 'update' | 'achievement' | 'article';
    visibility: 'public' | 'connections';
    imageUrl: string | null;
    videoUrl: string | null;
    videoDurationSeconds: number | null;
  }) => Promise<void>;
}

function readVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';

    const cleanup = () => {
      video.onloadedmetadata = null;
      video.onerror = null;
      URL.revokeObjectURL(objectUrl);
    };

    video.onloadedmetadata = () => {
      const duration = video.duration;
      cleanup();
      if (!Number.isFinite(duration) || duration <= 0) {
        reject(new Error('Could not read video duration. Please use a standard MP4 or WebM video.'));
      } else {
        resolve(duration);
      }
    };

    video.onerror = () => {
      cleanup();
      reject(new Error('Unsupported or unreadable video file.'));
    };

    video.src = objectUrl;
  });
}

export const PostModal: React.FC<PostModalProps> = ({
  isOpen,
  onClose,
  authorName,
  authorAvatar,
  initialPost,
  initialFocusMedia = false,
  initialFocusVideo = false,
  initialPostType = 'update',
  onSubmit,
}) => {
  const { getAuthHeaders } = useAuth();
  const [content, setContent] = useState('');
  const [topic, setTopic] = useState('');
  const [postType, setPostType] = useState<'update' | 'achievement' | 'article'>('update');
  const [visibility, setVisibility] = useState<'public' | 'connections'>('public');
  const [imageUrl, setImageUrl] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [videoDurationSeconds, setVideoDurationSeconds] = useState<number | null>(null);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [error, setError] = useState('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    if (initialPost) {
      setContent(initialPost.content);
      setTopic(initialPost.topic === 'General' ? '' : initialPost.topic);
      setPostType(
        initialPost.postType === 'achievement' || initialPost.postType === 'article'
          ? initialPost.postType
          : 'update'
      );
      setVisibility(initialPost.visibility);
      setImageUrl(initialPost.imageUrl || '');
      setVideoUrl(initialPost.videoUrl || '');
      setVideoDurationSeconds(initialPost.videoDurationSeconds ?? null);
      setShowUrlInput(Boolean(initialPost.imageUrl && initialPost.imageUrl.startsWith('http')));
    } else {
      setContent('');
      setTopic('');
      setPostType(initialPostType);
      setVisibility('public');
      setImageUrl('');
      setVideoUrl('');
      setVideoDurationSeconds(null);
      setShowUrlInput(false);
    }
    setVideoProgress(0);
    setError('');

    const timer = window.setTimeout(() => {
      if (initialFocusVideo) {
        videoInputRef.current?.click();
      } else if (initialFocusMedia) {
        fileInputRef.current?.click();
      } else {
        textareaRef.current?.focus();
      }
    }, 60);
    return () => window.clearTimeout(timer);
  }, [initialFocusMedia, initialFocusVideo, initialPost, initialPostType, isOpen]);

  if (!isOpen) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    setError('');
    try {
      const compressed = await readAndCompressImage(file, 1280, 0.82);
      setImageUrl(compressed);
      setVideoUrl('');
      setVideoDurationSeconds(null);
      setShowUrlInput(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to attach image');
    } finally {
      setUploadingImage(false);
      e.target.value = '';
    }
  };

  const handleVideoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setError('');
    if (file.size > MAX_VIDEO_BYTES) {
      setError('Video file exceeds the 65 MB upload limit.');
      return;
    }

    setUploadingVideo(true);
    setVideoProgress(0);
    try {
      const duration = await readVideoDuration(file);
      if (duration > MAX_VIDEO_SECONDS) {
        throw new Error(
          `Selected video is ${formatVideoDuration(duration)}. Videos cannot exceed 3 minutes (3:00).`
        );
      }

      const roundedDuration = Math.max(1, Math.min(MAX_VIDEO_SECONDS, Math.round(duration)));
      const headers = await getAuthHeaders(false);
      const formData = new FormData();
      formData.append('durationSeconds', String(roundedDuration));
      formData.append('video', file);

      const result = await new Promise<{ videoUrl: string; durationSeconds: number }>(
        (resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', '/api/feed/media/video', true);
          Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));

          xhr.upload.onprogress = (evt) => {
            if (evt.lengthComputable) {
              setVideoProgress(Math.round((evt.loaded / evt.total) * 100));
            }
          };

          xhr.onload = () => {
            try {
              const parsed = JSON.parse(xhr.responseText || '{}');
              if (xhr.status >= 200 && xhr.status < 300 && parsed.videoUrl) {
                resolve(parsed);
              } else {
                reject(new Error(parsed.error || `Video upload failed (${xhr.status})`));
              }
            } catch {
              reject(new Error(`Video upload failed (${xhr.status})`));
            }
          };

          xhr.onerror = () => reject(new Error('Network error while uploading video.'));
          xhr.send(formData);
        }
      );

      setVideoUrl(result.videoUrl);
      setVideoDurationSeconds(result.durationSeconds);
      setImageUrl('');
      setShowUrlInput(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to upload video');
    } finally {
      setUploadingVideo(false);
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || submitting || uploadingVideo || uploadingImage) return;
    setSubmitting(true);
    setError('');
    try {
      await onSubmit({
        content: content.trim(),
        topic: topic.trim() || 'General',
        postType,
        visibility,
        imageUrl: imageUrl.trim() || null,
        videoUrl: videoUrl.trim() || null,
        videoDurationSeconds: videoUrl.trim() ? videoDurationSeconds : null,
      });
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save post');
    } finally {
      setSubmitting(false);
    }
  };

  const mediaBusy = uploadingImage || uploadingVideo;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting && !mediaBusy) onClose();
      }}
    >
      <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            {initialPost ? 'Edit post' : 'Create a post'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting || mediaBusy}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Close modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleFormSubmit} className="p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#0F5C4D] text-sm font-semibold text-white">
                {authorAvatar ? (
                  <img
                    src={authorAvatar}
                    alt={authorName}
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  authorName.charAt(0).toUpperCase()
                )}
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{authorName}</p>
                <select
                  value={visibility}
                  onChange={(e) => setVisibility(e.target.value as 'public' | 'connections')}
                  className="mt-0.5 rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
                >
                  <option value="public">Anyone on ResuMind</option>
                  <option value="connections">Connections only</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-1 rounded-lg border border-slate-200 p-0.5 text-xs dark:border-slate-700">
              {(
                [
                  { id: 'update', label: 'Update', icon: FileText },
                  { id: 'achievement', label: 'Milestone', icon: Award },
                ] as const
              ).map((t) => {
                const Icon = t.icon;
                const active = postType === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setPostType(t.id)}
                    className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 font-medium ${
                      active
                        ? 'bg-[#0F5C4D] text-white'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
                    }`}
                  >
                    <Icon className="h-3 w-3" />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          <textarea
            ref={textareaRef}
            rows={5}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="What do you want to talk about?"
            className="mt-4 w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm text-slate-900 focus:border-[#0F5C4D] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />

          <div className="mt-3">
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Topic (optional, e.g. Software Engineering, Finance, Mbabane)"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 focus:border-[#0F5C4D] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            />
          </div>

          {showUrlInput && (
            <div className="mt-2.5">
              <input
                type="url"
                value={imageUrl.startsWith('data:') ? '' : imageUrl}
                onChange={(e) => {
                  setImageUrl(e.target.value);
                  if (e.target.value.trim()) {
                    setVideoUrl('');
                    setVideoDurationSeconds(null);
                  }
                }}
                placeholder="Paste image URL (https://...)"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 focus:border-[#0F5C4D] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
              />
            </div>
          )}

          {uploadingVideo && (
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
              <div className="flex items-center justify-between text-xs font-medium text-slate-700 dark:text-slate-300">
                <span>Uploading video...</span>
                <span className="font-mono tabular-nums">{videoProgress}%</span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                <div
                  className="h-full bg-[#0F5C4D] transition-all"
                  style={{ width: `${videoProgress}%` }}
                />
              </div>
            </div>
          )}

          {imageUrl && (
            <div className="relative mt-3 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
              <img
                src={imageUrl}
                alt="Selected attachment preview"
                className="max-h-60 w-full object-cover"
              />
              <button
                type="button"
                onClick={() => setImageUrl('')}
                className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-lg bg-slate-900/80 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-900"
              >
                <Trash2 className="h-3 w-3" />
                Remove
              </button>
            </div>
          )}

          {videoUrl && (
            <div className="relative mt-3">
              <AuthenticatedPostVideo
                videoUrl={videoUrl}
                durationSeconds={videoDurationSeconds}
                className="mt-0"
              />
              <button
                type="button"
                onClick={() => {
                  setVideoUrl('');
                  setVideoDurationSeconds(null);
                }}
                className="absolute left-2.5 top-2.5 z-10 inline-flex items-center gap-1 rounded-lg bg-slate-900/80 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-900"
              >
                <Trash2 className="h-3 w-3" />
                Remove video
              </button>
            </div>
          )}

          {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={handleFileChange}
            className="hidden"
          />
          <input
            ref={videoInputRef}
            type="file"
            accept="video/mp4,video/webm,video/quicktime,video/x-m4v,video/ogg"
            onChange={handleVideoChange}
            className="hidden"
          />

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3.5 dark:border-slate-800">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={mediaBusy}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <ImagePlus className="h-3.5 w-3.5 text-[#0F5C4D] dark:text-emerald-400" />
                {uploadingImage ? 'Processing...' : 'Photo'}
              </button>
              <button
                type="button"
                onClick={() => videoInputRef.current?.click()}
                disabled={mediaBusy}
                title="Upload video up to 3 minutes (max 65 MB)"
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <Film className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                {uploadingVideo ? 'Uploading...' : 'Video (≤ 3m)'}
              </button>
              <button
                type="button"
                onClick={() => setShowUrlInput((v) => !v)}
                disabled={mediaBusy}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <Link2 className="h-3.5 w-3.5" />
                Image URL
              </button>
            </div>

            <button
              type="submit"
              disabled={submitting || mediaBusy || !content.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F5C4D] px-4 py-2 text-xs font-medium text-white hover:bg-[#0c4a3e] disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" />
              {submitting ? 'Saving...' : initialPost ? 'Save changes' : 'Post'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
