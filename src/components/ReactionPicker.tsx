import React, { useEffect, useId, useRef, useState } from 'react';
import { ChevronUp } from 'lucide-react';
import { ReactionType } from '../types';

export interface ReactionMeta {
  type: ReactionType;
  label: string;
  colorClass: string;
  ringClass: string;
}

export const REACTION_LIST: ReactionMeta[] = [
  {
    type: 'like',
    label: 'Like',
    colorClass: 'text-blue-600 dark:text-blue-400',
    ringClass: 'ring-blue-500/30',
  },
  {
    type: 'love',
    label: 'Love',
    colorClass: 'text-rose-600 dark:text-rose-400',
    ringClass: 'ring-rose-500/30',
  },
  {
    type: 'celebrate',
    label: 'Celebrate',
    colorClass: 'text-emerald-600 dark:text-emerald-400',
    ringClass: 'ring-emerald-500/30',
  },
  {
    type: 'support',
    label: 'Support',
    colorClass: 'text-violet-600 dark:text-violet-400',
    ringClass: 'ring-violet-500/30',
  },
  {
    type: 'insightful',
    label: 'Insightful',
    colorClass: 'text-amber-600 dark:text-amber-400',
    ringClass: 'ring-amber-500/30',
  },
  {
    type: 'funny',
    label: 'Funny',
    colorClass: 'text-yellow-600 dark:text-yellow-400',
    ringClass: 'ring-yellow-500/30',
  },
  {
    type: 'dislike',
    label: 'Dislike',
    colorClass: 'text-slate-700 dark:text-slate-300',
    ringClass: 'ring-slate-500/30',
  },
  {
    type: 'hate',
    label: 'Hate',
    colorClass: 'text-red-600 dark:text-red-400',
    ringClass: 'ring-red-500/30',
  },
];

export const REACTION_MAP: Record<ReactionType, ReactionMeta> = REACTION_LIST.reduce(
  (acc, item) => {
    acc[item.type] = item;
    return acc;
  },
  {} as Record<ReactionType, ReactionMeta>
);

export function normalizeReactionType(raw?: string | null): ReactionType | null {
  if (!raw) return null;
  if (raw in REACTION_MAP) return raw as ReactionType;
  return 'like';
}

export const ReactionIcon: React.FC<{
  type: ReactionType;
  size?: number;
  className?: string;
}> = ({ type, size = 24, className = '' }) => {
  const uid = useId().replace(/:/g, '');

  if (type === 'like') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 36 36"
        fill="none"
        aria-hidden="true"
        className={className}
      >
        <defs>
          <linearGradient id={`${uid}-like-bg`} x1="4" y1="2" x2="32" y2="34" gradientUnits="userSpaceOnUse">
            <stop stopColor="#3B82F6" />
            <stop offset="1" stopColor="#1D4ED8" />
          </linearGradient>
        </defs>
        <circle cx="18" cy="18" r="17" fill={`url(#${uid}-like-bg)`} stroke="#FFFFFF" strokeWidth="1.5" />
        <path
          d="M11 16.5H13.6C14 16.5 14.3 16.2 14.4 15.8L16.3 10.6C16.7 9.5 17.8 8.9 18.8 9.2C19.6 9.5 20 10.3 19.8 11.3L19.1 14.8H24.3C25.6 14.8 26.5 16 26.2 17.3L24.8 23.6C24.5 24.8 23.5 25.6 22.3 25.6H14.5C13.9 25.6 13.5 25.1 13.5 24.5V17.5M10.2 16.5H12.2C12.7 16.5 13.1 16.9 13.1 17.4V24.7C13.1 25.2 12.7 25.6 12.2 25.6H10.2C9.7 25.6 9.3 25.2 9.3 24.7V17.4C9.3 16.9 9.7 16.5 10.2 16.5Z"
          fill="#FFFFFF"
        />
      </svg>
    );
  }

  if (type === 'love') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 36 36"
        fill="none"
        aria-hidden="true"
        className={className}
      >
        <defs>
          <linearGradient id={`${uid}-love-bg`} x1="4" y1="2" x2="32" y2="34" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FB7185" />
            <stop offset="1" stopColor="#E11D48" />
          </linearGradient>
        </defs>
        <circle cx="18" cy="18" r="17" fill={`url(#${uid}-love-bg)`} stroke="#FFFFFF" strokeWidth="1.5" />
        <path
          d="M18 26.4C17.6 26.4 17.2 26.2 16.9 26C12.2 22.4 9.5 19.3 9.5 15.6C9.5 12.7 11.7 10.6 14.4 10.6C16 10.6 17.2 11.4 18 12.6C18.8 11.4 20 10.6 21.6 10.6C24.3 10.6 26.5 12.7 26.5 15.6C26.5 19.3 23.8 22.4 19.1 26C18.8 26.2 18.4 26.4 18 26.4Z"
          fill="#FFFFFF"
        />
      </svg>
    );
  }

  if (type === 'celebrate') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 36 36"
        fill="none"
        aria-hidden="true"
        className={className}
      >
        <defs>
          <linearGradient id={`${uid}-cel-bg`} x1="4" y1="2" x2="32" y2="34" gradientUnits="userSpaceOnUse">
            <stop stopColor="#10B981" />
            <stop offset="1" stopColor="#047857" />
          </linearGradient>
        </defs>
        <circle cx="18" cy="18" r="17" fill={`url(#${uid}-cel-bg)`} stroke="#FFFFFF" strokeWidth="1.5" />
        <path
          d="M18 7.6V10.4M12.2 9.8L13.9 11.8M23.8 9.8L22.1 11.8"
          stroke="#FDE68A"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M15.4 13.5C15.9 12.7 17 12.7 17.6 13.4L20.5 16.8L22.7 14.8C23.3 14.3 24.2 14.5 24.5 15.2L25.8 18.4C26.5 20.1 25.9 22.1 24.5 23.4L21.9 25.6C20 27.2 17.2 27.1 15.4 25.4L11.6 21.7C10.5 20.6 10.6 18.8 11.8 17.8L15.4 13.5Z"
          fill="#FFFFFF"
        />
      </svg>
    );
  }

  if (type === 'support') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 36 36"
        fill="none"
        aria-hidden="true"
        className={className}
      >
        <defs>
          <linearGradient id={`${uid}-sup-bg`} x1="4" y1="2" x2="32" y2="34" gradientUnits="userSpaceOnUse">
            <stop stopColor="#A78BFA" />
            <stop offset="1" stopColor="#6D28D9" />
          </linearGradient>
        </defs>
        <circle cx="18" cy="18" r="17" fill={`url(#${uid}-sup-bg)`} stroke="#FFFFFF" strokeWidth="1.5" />
        <path
          d="M18 19.2C17.8 19.2 17.5 19.1 17.3 18.9C14.7 16.9 13.2 15.2 13.2 13.2C13.2 11.6 14.4 10.4 15.9 10.4C16.8 10.4 17.5 10.8 18 11.5C18.5 10.8 19.2 10.4 20.1 10.4C21.6 10.4 22.8 11.6 22.8 13.2C22.8 15.2 21.3 16.9 18.7 18.9C18.5 19.1 18.2 19.2 18 19.2Z"
          fill="#FDE68A"
        />
        <path
          d="M9.6 20.4C9.6 19.6 10.4 19.1 11.2 19.4L15.8 21.5C16.6 21.9 17.4 22 18.2 22C19 22 19.8 21.8 20.6 21.4L24.8 19.4C25.6 19 26.4 19.6 26.4 20.4V21.7C26.4 22.9 25.7 23.9 24.6 24.4L20.1 26.4C18.8 27 17.2 27 15.9 26.4L11.4 24.4C10.3 23.9 9.6 22.9 9.6 21.7V20.4Z"
          fill="#FFFFFF"
        />
      </svg>
    );
  }

  if (type === 'insightful') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 36 36"
        fill="none"
        aria-hidden="true"
        className={className}
      >
        <defs>
          <linearGradient id={`${uid}-ins-bg`} x1="4" y1="2" x2="32" y2="34" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FBBF24" />
            <stop offset="1" stopColor="#D97706" />
          </linearGradient>
        </defs>
        <circle cx="18" cy="18" r="17" fill={`url(#${uid}-ins-bg)`} stroke="#FFFFFF" strokeWidth="1.5" />
        <path
          d="M18 7.5V9.5M10.8 10.5L12.2 11.9M25.2 10.5L23.8 11.9M8.5 17.2H10.5M25.5 17.2H27.5"
          stroke="#FEF3C7"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M18 11.5C14.7 11.5 12.2 14 12.2 17.1C12.2 19.1 13.2 20.8 14.6 21.8C15 22.1 15.2 22.6 15.2 23.1V23.8H20.8V23.1C20.8 22.6 21 22.1 21.4 21.8C22.8 20.8 23.8 19.1 23.8 17.1C23.8 14 21.3 11.5 18 11.5ZM15.5 25.4H20.5V26.7C20.5 27.3 20 27.8 19.4 27.8H16.6C16 27.8 15.5 27.3 15.5 26.7V25.4Z"
          fill="#FFFFFF"
        />
      </svg>
    );
  }

  if (type === 'funny') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 36 36"
        fill="none"
        aria-hidden="true"
        className={className}
      >
        <defs>
          <linearGradient id={`${uid}-fun-bg`} x1="4" y1="2" x2="32" y2="34" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FDE047" />
            <stop offset="1" stopColor="#EAB308" />
          </linearGradient>
        </defs>
        <circle cx="18" cy="18" r="17" fill={`url(#${uid}-fun-bg)`} stroke="#FFFFFF" strokeWidth="1.5" />
        <path
          d="M11.6 14.8C12.5 13.7 14 13.7 14.9 14.8M21.1 14.8C22 13.7 23.5 13.7 24.4 14.8"
          stroke="#78350F"
          strokeWidth="2.1"
          strokeLinecap="round"
        />
        <path
          d="M11.2 19.2H24.8C24.8 23.2 21.8 26.2 18 26.2C14.2 26.2 11.2 23.2 11.2 19.2Z"
          fill="#78350F"
        />
        <path
          d="M13.3 20H22.7C22.4 21.1 21.5 21.9 18 21.9C14.5 21.9 13.6 21.1 13.3 20Z"
          fill="#FFFFFF"
        />
        <path
          d="M15.2 24.4C16.1 23.6 19.9 23.6 20.8 24.4C19.9 25.3 18.9 25.6 18 25.6C17.1 25.6 16.1 25.3 15.2 24.4Z"
          fill="#FB7185"
        />
      </svg>
    );
  }

  if (type === 'dislike') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 36 36"
        fill="none"
        aria-hidden="true"
        className={className}
      >
        <defs>
          <linearGradient id={`${uid}-dis-bg`} x1="4" y1="2" x2="32" y2="34" gradientUnits="userSpaceOnUse">
            <stop stopColor="#64748B" />
            <stop offset="1" stopColor="#334155" />
          </linearGradient>
        </defs>
        <circle cx="18" cy="18" r="17" fill={`url(#${uid}-dis-bg)`} stroke="#FFFFFF" strokeWidth="1.5" />
        <path
          d="M11 19.5H13.6C14 19.5 14.3 19.8 14.4 20.2L16.3 25.4C16.7 26.5 17.8 27.1 18.8 26.8C19.6 26.5 20 25.7 19.8 24.7L19.1 21.2H24.3C25.6 21.2 26.5 20 26.2 18.7L24.8 12.4C24.5 11.2 23.5 10.4 22.3 10.4H14.5C13.9 10.4 13.5 10.9 13.5 11.5V18.5M10.2 19.5H12.2C12.7 19.5 13.1 19.1 13.1 18.6V11.3C13.1 10.8 12.7 10.4 12.2 10.4H10.2C9.7 10.4 9.3 10.8 9.3 11.3V18.6C9.3 19.1 9.7 19.5 10.2 19.5Z"
          fill="#FFFFFF"
        />
      </svg>
    );
  }

  // hate
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <defs>
        <linearGradient id={`${uid}-hate-bg`} x1="18" y1="2" x2="18" y2="34" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FB923C" />
          <stop offset="0.45" stopColor="#EF4444" />
          <stop offset="1" stopColor="#991B1B" />
        </linearGradient>
      </defs>
      <circle cx="18" cy="18" r="17" fill={`url(#${uid}-hate-bg)`} stroke="#FFFFFF" strokeWidth="1.5" />
      <path
        d="M10.4 12.6L15.6 15.2M25.6 12.6L20.4 15.2"
        stroke="#450A0A"
        strokeWidth="2.3"
        strokeLinecap="round"
      />
      <circle cx="13.4" cy="17.1" r="1.65" fill="#450A0A" />
      <circle cx="22.6" cy="17.1" r="1.65" fill="#450A0A" />
      <path
        d="M12.6 24.4C14.1 21.8 21.9 21.8 23.4 24.4"
        stroke="#450A0A"
        strokeWidth="2.3"
        strokeLinecap="round"
      />
    </svg>
  );
};

export const ReactionSummary: React.FC<{
  reactionCount: number;
  reactionBreakdown?: Partial<Record<ReactionType, number>>;
}> = ({ reactionCount, reactionBreakdown }) => {
  if (!reactionCount) return null;

  const topTypes = REACTION_LIST.filter((r) => (reactionBreakdown?.[r.type] ?? 0) > 0)
    .sort((a, b) => (reactionBreakdown?.[b.type] ?? 0) - (reactionBreakdown?.[a.type] ?? 0))
    .slice(0, 4);

  const fallbackTypes = topTypes.length > 0 ? topTypes : [REACTION_MAP.like];

  return (
    <div className="mt-3 flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
      <div className="flex items-center -space-x-1.5">
        {fallbackTypes.map((meta) => (
          <ReactionIcon
            key={meta.type}
            type={meta.type}
            size={20}
            className="rounded-full shadow-xs"
          />
        ))}
      </div>
      <span className="font-mono text-xs font-medium tabular-nums">{reactionCount}</span>
      <span className="text-xs text-slate-500">
        {topTypes.length > 0
          ? topTypes.map((t) => t.label).join(' · ')
          : reactionCount === 1
          ? 'reaction'
          : 'reactions'}
      </span>
    </div>
  );
};

export const PostReactionButton: React.FC<{
  userReaction?: string | null;
  reactionCount: number;
  onReact: (type: ReactionType) => void;
}> = ({ userReaction, reactionCount, onReact }) => {
  const [pickerOpen, setPickerOpen] = useState(false);
  const hoverCloseTimer = useRef<number | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const normalized = normalizeReactionType(userReaction);
  const activeMeta = normalized ? REACTION_MAP[normalized] : null;

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const scheduleClose = () => {
    if (hoverCloseTimer.current) window.clearTimeout(hoverCloseTimer.current);
    hoverCloseTimer.current = window.setTimeout(() => setPickerOpen(false), 220);
  };

  const cancelClose = () => {
    if (hoverCloseTimer.current) {
      window.clearTimeout(hoverCloseTimer.current);
      hoverCloseTimer.current = null;
    }
  };

  return (
    <div
      ref={wrapperRef}
      className="relative inline-flex items-center"
      onMouseEnter={() => {
        cancelClose();
        setPickerOpen(true);
      }}
      onMouseLeave={scheduleClose}
    >
      {pickerOpen && (
        <div
          role="toolbar"
          aria-label="Choose a reaction"
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          className="absolute bottom-full left-0 z-30 mb-2 flex max-w-[calc(100vw-2rem)] flex-wrap items-center gap-1 rounded-2xl border border-slate-200 bg-white px-2 py-1.5 shadow-xl sm:flex-nowrap sm:gap-1.5 sm:px-2.5 sm:py-2 dark:border-slate-700 dark:bg-slate-900"
        >
          {REACTION_LIST.map((item) => {
            const isSelected = normalized === item.type;
            return (
              <button
                key={item.type}
                type="button"
                onClick={() => {
                  onReact(item.type);
                  setPickerOpen(false);
                }}
                title={item.label}
                aria-label={item.label}
                className={`group relative flex flex-col items-center rounded-xl p-1 transition-transform duration-150 hover:-translate-y-1 hover:scale-115 focus-visible:outline-2 focus-visible:outline-[#0F5C4D] ${
                  isSelected ? `ring-2 ${item.ringClass} bg-slate-50 dark:bg-slate-800` : ''
                }`}
              >
                <ReactionIcon type={item.type} size={32} className="drop-shadow-xs" />
                <span className="pointer-events-none absolute -top-7 rounded-md bg-slate-900 px-1.5 py-0.5 text-[10px] font-semibold text-white opacity-0 shadow-sm transition-opacity group-hover:opacity-100 whitespace-nowrap dark:bg-slate-100 dark:text-slate-900">
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="inline-flex items-center">
        <button
          type="button"
          onClick={() => onReact(normalized ?? 'like')}
          className={`inline-flex items-center gap-1.5 rounded-l-lg py-1 pl-1 pr-1.5 text-xs font-medium transition-colors ${
            activeMeta
              ? activeMeta.colorClass
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
          }`}
        >
          {activeMeta ? (
            <ReactionIcon type={activeMeta.type} size={20} />
          ) : (
            <ReactionIcon type="like" size={20} className="opacity-70 grayscale" />
          )}
          <span>{activeMeta ? activeMeta.label : 'Like'}</span>
          {reactionCount > 0 && (
            <span className="font-mono tabular-nums opacity-85">{reactionCount}</span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          aria-label="Choose emotion reaction"
          aria-expanded={pickerOpen}
          className="rounded-r-lg px-1 py-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        >
          <ChevronUp className={`h-3.5 w-3.5 transition-transform ${pickerOpen ? 'rotate-180' : ''}`} />
        </button>
      </div>
    </div>
  );
};
