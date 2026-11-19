import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  FileText,
  Film,
  Image as ImageIcon,
  Repeat2,
  Share2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { FeedPost } from '../types';

const videoObjectUrlCache = new Map<string, string>();
const videoInflightCache = new Map<string, Promise<string>>();

export function formatVideoDuration(seconds?: number | null): string {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return '';
  const total = Math.round(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

async function resolveAuthenticatedMediaUrl(
  url: string,
  getAuthHeaders: (forceRefresh?: boolean) => Promise<Record<string, string>>
): Promise<string> {
  if (!url.startsWith('/api/')) return url;
  const cached = videoObjectUrlCache.get(url);
  if (cached) return cached;

  const inflight = videoInflightCache.get(url);
  if (inflight) return inflight;

  const promise = (async () => {
    let headers = await getAuthHeaders(false);
    let res = await fetch(url, { headers });
    if (res.status === 401) {
      headers = await getAuthHeaders(true);
      res = await fetch(url, { headers });
    }
    if (!res.ok) {
      throw new Error('Unable to load video');
    }
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    videoObjectUrlCache.set(url, objUrl);
    return objUrl;
  })().finally(() => {
    videoInflightCache.delete(url);
  });

  videoInflightCache.set(url, promise);
  return promise;
}

export const AuthenticatedPostVideo: React.FC<{
  videoUrl: string;
  durationSeconds?: number | null;
  className?: string;
}> = ({ videoUrl, durationSeconds, className = '' }) => {
  const { getAuthHeaders } = useAuth();
  const [resolvedUrl, setResolvedUrl] = useState<string>(() =>
    videoUrl.startsWith('/api/') ? videoObjectUrlCache.get(videoUrl) || '' : videoUrl
  );
  const [loading, setLoading] = useState(!resolvedUrl);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    if (!videoUrl.startsWith('/api/')) {
      setResolvedUrl(videoUrl);
      setLoading(false);
      setFailed(false);
      return;
    }

    const cached = videoObjectUrlCache.get(videoUrl);
    if (cached) {
      setResolvedUrl(cached);
      setLoading(false);
      setFailed(false);
      return;
    }

    setLoading(true);
    setFailed(false);
    resolveAuthenticatedMediaUrl(videoUrl, getAuthHeaders)
      .then((objUrl) => {
        if (!active) return;
        setResolvedUrl(objUrl);
      })
      .catch(() => {
        if (!active) return;
        setFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [getAuthHeaders, videoUrl]);

  const durationLabel = formatVideoDuration(durationSeconds);

  return (
    <div
      className={`relative mt-3 overflow-hidden rounded-lg border border-slate-200 bg-slate-950 dark:border-slate-800 ${className}`}
    >
      {durationLabel && (
        <span className="pointer-events-none absolute right-2.5 top-2.5 z-10 inline-flex items-center gap-1 rounded-md bg-slate-950/75 px-2 py-0.5 font-mono text-[11px] font-medium text-white tabular-nums backdrop-blur-xs">
          <Film className="h-3 w-3" />
          {durationLabel}
        </span>
      )}
      {loading ? (
        <div className="flex h-56 items-center justify-center text-xs text-slate-300">
          Loading video...
        </div>
      ) : failed || !resolvedUrl ? (
        <div className="flex h-40 items-center justify-center text-xs text-red-300">
          Unable to load video playback.
        </div>
      ) : (
        <video
          src={resolvedUrl}
          controls
          playsInline
          preload="metadata"
          className="max-h-[420px] w-full bg-black object-contain"
        />
      )}
    </div>
  );
};

function triggerBrowserDownload(href: string, filename: string) {
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function wrapCanvasLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const paragraphs = text.split('\n');
  const lines: string[] = [];
  for (const para of paragraphs) {
    if (!para.trim()) {
      lines.push('');
      continue;
    }
    const words = para.split(/\s+/);
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (ctx.measureText(candidate).width <= maxWidth) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

async function downloadPostAsCardPng(post: FeedPost) {
  const width = 1200;
  const padding = 64;
  const contentWidth = width - padding * 2;

  const measureCanvas = document.createElement('canvas');
  const mctx = measureCanvas.getContext('2d');
  if (!mctx) return;

  mctx.font = '400 28px Inter, system-ui, -apple-system, sans-serif';
  const wrappedLines = wrapCanvasLines(mctx, post.content, contentWidth).slice(0, 26);

  let loadedImg: HTMLImageElement | null = null;
  if (post.imageUrl) {
    loadedImg = await new Promise<HTMLImageElement | null>((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = post.imageUrl!;
    });
  }

  let imgRenderHeight = 0;
  if (loadedImg && loadedImg.naturalWidth > 0) {
    const ratio = loadedImg.naturalHeight / loadedImg.naturalWidth;
    imgRenderHeight = Math.min(540, Math.round(contentWidth * ratio));
  }

  const headerHeight = 120;
  const textHeight = wrappedLines.length * 42 + 24;
  const imgSectionHeight = imgRenderHeight > 0 ? imgRenderHeight + 32 : 0;
  const footerHeight = 90;
  const totalHeight = Math.max(420, padding * 2 + headerHeight + textHeight + imgSectionHeight + footerHeight);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = totalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, totalHeight);

  // Subtle top accent bar
  ctx.fillStyle = '#0F5C4D';
  ctx.fillRect(0, 0, width, 10);

  // Avatar circle
  const avatarCenterX = padding + 34;
  const avatarCenterY = padding + 42;
  ctx.fillStyle = '#0F5C4D';
  ctx.beginPath();
  ctx.arc(avatarCenterX, avatarCenterY, 34, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  ctx.font = '700 28px Inter, system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(post.authorName.charAt(0).toUpperCase(), avatarCenterX, avatarCenterY);

  // Author & meta
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#0F172A';
  ctx.font = '700 28px Inter, system-ui, -apple-system, sans-serif';
  ctx.fillText(post.authorName, padding + 88, padding + 36);

  ctx.fillStyle = '#64748B';
  ctx.font = '400 21px Inter, system-ui, -apple-system, sans-serif';
  const metaLine = [
    post.authorHeadline || 'ResuMind Member',
    post.topic,
    new Date(post.createdAt).toLocaleDateString(),
  ]
    .filter(Boolean)
    .join('  ·  ');
  ctx.fillText(metaLine.slice(0, 74), padding + 88, padding + 68);

  // Post body text
  let cursorY = padding + headerHeight + 16;
  ctx.fillStyle = '#1E293B';
  ctx.font = '400 28px Inter, system-ui, -apple-system, sans-serif';
  for (const line of wrappedLines) {
    if (line) {
      ctx.fillText(line, padding, cursorY);
    }
    cursorY += 42;
  }

  // Optional embedded image
  if (loadedImg && imgRenderHeight > 0) {
    cursorY += 12;
    ctx.drawImage(loadedImg, padding, cursorY, contentWidth, imgRenderHeight);
    cursorY += imgRenderHeight + 24;
  }

  // Footer divider & branding
  const footerY = totalHeight - padding - 10;
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(padding, footerY - 36);
  ctx.lineTo(width - padding, footerY - 36);
  ctx.stroke();

  ctx.fillStyle = '#0F5C4D';
  ctx.font = '700 22px Inter, system-ui, -apple-system, sans-serif';
  ctx.fillText('ResuMind', padding, footerY);

  ctx.fillStyle = '#64748B';
  ctx.font = '400 20px Inter, system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(
    `${post.reactionCount} reactions  ·  ${post.commentCount} comments`,
    width - padding,
    footerY
  );

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) return;
  const objUrl = URL.createObjectURL(blob);
  triggerBrowserDownload(objUrl, `resumind-post-${post.id}.png`);
  window.setTimeout(() => URL.revokeObjectURL(objUrl), 5000);
}

function downloadPostAsText(post: FeedPost) {
  const lines = [
    `${post.authorName}${post.organization ? ` (${post.organization.name})` : ''}`,
    post.authorHeadline || '',
    `${post.topic} · ${new Date(post.createdAt).toLocaleString()}`,
    '',
    post.content,
    '',
    `Reactions: ${post.reactionCount} | Comments: ${post.commentCount}`,
    `Shared from ResuMind: ${window.location.origin}/?post=${post.id}`,
  ].filter((l) => l !== undefined);
  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
  const objUrl = URL.createObjectURL(blob);
  triggerBrowserDownload(objUrl, `resumind-post-${post.id}.txt`);
  window.setTimeout(() => URL.revokeObjectURL(objUrl), 5000);
}

export const PostDownloadMenu: React.FC<{
  post: FeedPost;
}> = ({ post }) => {
  const { getAuthHeaders } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [statusLabel, setStatusLabel] = useState('');
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const markDone = (label: string) => {
    setStatusLabel(label);
    setOpen(false);
    window.setTimeout(() => setStatusLabel(''), 2200);
  };

  const handleDownloadVideo = async () => {
    if (!post.videoUrl || busy) return;
    setBusy(true);
    try {
      const objUrl = await resolveAuthenticatedMediaUrl(post.videoUrl, getAuthHeaders);
      const extMatch = /\.(mp4|webm|mov|m4v|ogv|ogg)(?:$|\?)/i.exec(post.videoUrl);
      const ext = extMatch ? extMatch[1].toLowerCase() : 'mp4';
      triggerBrowserDownload(objUrl, `resumind-post-${post.id}-video.${ext}`);
      markDone('Saved');
    } catch {
      markDone('Failed');
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadImage = async () => {
    if (!post.imageUrl || busy) return;
    setBusy(true);
    try {
      if (post.imageUrl.startsWith('data:')) {
        const mimeMatch = /^data:image\/([a-z0-9+]+);/i.exec(post.imageUrl);
        const ext = mimeMatch ? mimeMatch[1].replace('jpeg', 'jpg') : 'png';
        triggerBrowserDownload(post.imageUrl, `resumind-post-${post.id}-image.${ext}`);
      } else {
        const res = await fetch(post.imageUrl);
        const blob = await res.blob();
        const objUrl = URL.createObjectURL(blob);
        triggerBrowserDownload(objUrl, `resumind-post-${post.id}-image.png`);
        window.setTimeout(() => URL.revokeObjectURL(objUrl), 5000);
      }
      markDone('Saved');
    } catch {
      await downloadPostAsCardPng(post);
      markDone('Saved');
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadCard = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await downloadPostAsCardPng(post);
      markDone('Saved');
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadText = () => {
    downloadPostAsText(post);
    markDone('Saved');
  };

  return (
    <div ref={wrapRef} className="relative inline-flex items-center">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        className={`inline-flex items-center gap-1.5 font-medium transition-colors ${
          statusLabel === 'Saved'
            ? 'text-[#0F5C4D] dark:text-emerald-400'
            : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
        }`}
      >
        {statusLabel === 'Saved' ? (
          <Check className="h-3.5 w-3.5" />
        ) : (
          <Download className="h-3.5 w-3.5" />
        )}
        <span>{busy ? 'Saving...' : statusLabel || 'Download'}</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute bottom-full right-0 z-30 mb-2 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl dark:border-slate-700 dark:bg-slate-900"
        >
          {post.videoUrl && (
            <button
              type="button"
              role="menuitem"
              onClick={handleDownloadVideo}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Film className="h-3.5 w-3.5 text-[#0F5C4D] dark:text-emerald-400" />
              Download Video
            </button>
          )}
          {post.imageUrl && (
            <button
              type="button"
              role="menuitem"
              onClick={handleDownloadImage}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <ImageIcon className="h-3.5 w-3.5 text-[#0F5C4D] dark:text-emerald-400" />
              Download Image
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={handleDownloadCard}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Download className="h-3.5 w-3.5 text-slate-500" />
            Save Post Card (.png)
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={handleDownloadText}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <FileText className="h-3.5 w-3.5 text-slate-500" />
            Save Text (.txt)
          </button>
        </div>
      )}
    </div>
  );
};

export const PostShareMenu: React.FC<{
  post: FeedPost;
  onRepost?: (post: FeedPost) => Promise<void> | void;
}> = ({ post, onRepost }) => {
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState('');
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const shareUrl = `${window.location.origin}/?post=${post.id}`;
  const shareText = `${post.authorName} on ResuMind: ${post.content.slice(0, 180)}${
    post.content.length > 180 ? '...' : ''
  }`;

  const showFeedback = (label: string) => {
    setFeedback(label);
    setOpen(false);
    window.setTimeout(() => setFeedback(''), 2200);
  };

  const handleNativeShare = async () => {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: `${post.authorName} · ResuMind`,
          text: shareText,
          url: shareUrl,
        });
        showFeedback('Shared');
        return;
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          setOpen(false);
          return;
        }
      }
    }
    await handleCopyLink();
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
      showFeedback('Copied!');
    } catch {
      showFeedback('Copied!');
    }
  };

  const handleRepostClick = async () => {
    if (!onRepost) return;
    await onRepost(post);
    showFeedback('Reposted');
  };

  return (
    <div ref={wrapRef} className="relative inline-flex items-center">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 font-medium transition-colors ${
          feedback
            ? 'text-[#0F5C4D] dark:text-emerald-400'
            : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
        }`}
      >
        {feedback ? <Check className="h-3.5 w-3.5" /> : <Share2 className="h-3.5 w-3.5" />}
        <span>{feedback || 'Share'}</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute bottom-full left-0 z-30 mb-2 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl dark:border-slate-700 dark:bg-slate-900"
        >
          <button
            type="button"
            role="menuitem"
            onClick={handleNativeShare}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Share2 className="h-3.5 w-3.5 text-[#0F5C4D] dark:text-emerald-400" />
            Share via Apps / Device
          </button>
          {onRepost && (
            <button
              type="button"
              role="menuitem"
              onClick={handleRepostClick}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Repeat2 className="h-3.5 w-3.5 text-slate-500" />
              Repost to Feed
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={handleCopyLink}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Copy className="h-3.5 w-3.5 text-slate-500" />
            Copy Link & Text
          </button>
        </div>
      )}
    </div>
  );
};
