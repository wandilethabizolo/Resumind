import React, { useEffect, useRef, useState } from 'react';
import { Award, FileText, ImagePlus, Link2, Send, Trash2, X } from 'lucide-react';
import { readAndCompressImage } from '../lib/imageUpload';
import { FeedPost } from '../types';

interface PostModalProps {
  isOpen: boolean;
  onClose: () => void;
  authorName: string;
  authorAvatar?: string;
  initialPost?: FeedPost | null;
  initialFocusMedia?: boolean;
  initialPostType?: 'update' | 'achievement' | 'article';
  onSubmit: (payload: {
    content: string;
    topic: string;
    postType: 'update' | 'achievement' | 'article';
    visibility: 'public' | 'connections';
    imageUrl: string | null;
  }) => Promise<void>;
}

export const PostModal: React.FC<PostModalProps> = ({
  isOpen,
  onClose,
  authorName,
  authorAvatar,
  initialPost,
  initialFocusMedia = false,
  initialPostType = 'update',
  onSubmit,
}) => {
  const [content, setContent] = useState('');
  const [topic, setTopic] = useState('');
  const [postType, setPostType] = useState<'update' | 'achievement' | 'article'>('update');
  const [visibility, setVisibility] = useState<'public' | 'connections'>('public');
  const [imageUrl, setImageUrl] = useState('');
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [error, setError] = useState('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);
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
      setShowUrlInput(Boolean(initialPost.imageUrl && initialPost.imageUrl.startsWith('http')));
    } else {
      setContent('');
      setTopic('');
      setPostType(initialPostType);
      setVisibility('public');
      setImageUrl('');
      setShowUrlInput(false);
    }
    setError('');

    const timer = window.setTimeout(() => {
      if (initialFocusMedia) {
        fileInputRef.current?.click();
      } else {
        textareaRef.current?.focus();
      }
    }, 60);
    return () => window.clearTimeout(timer);
  }, [initialFocusMedia, initialPost, initialPostType, isOpen]);

  if (!isOpen) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    setError('');
    try {
      const compressed = await readAndCompressImage(file, 1280, 0.82);
      setImageUrl(compressed);
      setShowUrlInput(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to attach image');
    } finally {
      setUploadingImage(false);
      e.target.value = '';
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await onSubmit({
        content: content.trim(),
        topic: topic.trim() || 'General',
        postType,
        visibility,
        imageUrl: imageUrl.trim() || null,
      });
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save post');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div className="w-full max-w-xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            {initialPost ? 'Edit post' : 'Create a post'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
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
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="Paste image URL (https://...)"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 focus:border-[#0F5C4D] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
              />
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

          {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={handleFileChange}
            className="hidden"
          />

          <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-3.5 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingImage}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <ImagePlus className="h-3.5 w-3.5 text-[#0F5C4D] dark:text-emerald-400" />
                {uploadingImage ? 'Processing...' : 'Upload photo'}
              </button>
              <button
                type="button"
                onClick={() => setShowUrlInput((v) => !v)}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <Link2 className="h-3.5 w-3.5" />
                Image URL
              </button>
            </div>

            <button
              type="submit"
              disabled={submitting || uploadingImage || !content.trim()}
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
