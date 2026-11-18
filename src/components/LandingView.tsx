import React, { useEffect, useState } from 'react';
import { ArrowRight, ExternalLink } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { FeedPost, JobListing } from '../types';
import { PWAInstallButton } from './PWAInstallButton';

export const LandingView: React.FC = () => {
  const {
    signInWithGoogle,
    signInWithGoogleRedirect,
    authError,
    clearAuthError,
    firebaseUser,
    retryAuth,
    logout,
  } = useAuth();
  const [jobs, setJobs] = useState<JobListing[]>([]);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState('');
  const [isEmbedded, setIsEmbedded] = useState(false);

  useEffect(() => {
    try {
      setIsEmbedded(window.self !== window.top);
    } catch {
      setIsEmbedded(true);
    }
    fetch('/api/jobs')
      .then((r) => (r.ok ? r.json() : { jobs: [] }))
      .then((d) => setJobs((d.jobs || []).slice(0, 4)))
      .catch(() => {});
    fetch('/api/feed')
      .then((r) => (r.ok ? r.json() : { posts: [] }))
      .then((d) => setPosts((d.posts || []).slice(0, 3)))
      .catch(() => {});
  }, []);

  const handleSignIn = async () => {
    setSigningIn(true);
    setError('');
    clearAuthError();
    try {
      await signInWithGoogle();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sign-in was cancelled or failed.');
    } finally {
      setSigningIn(false);
    }
  };

  const handleRedirectSignIn = async () => {
    setSigningIn(true);
    setError('');
    clearAuthError();
    try {
      await signInWithGoogleRedirect();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Redirect sign-in failed.');
      setSigningIn(false);
    }
  };

  const displayError = error || authError || '';

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-4">
          <a
            href="/"
            className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0"
          >
            ResuMind
          </a>

          <div className="flex items-center gap-3 shrink-0">
            <PWAInstallButton />
            <button
              type="button"
              onClick={handleSignIn}
              disabled={signingIn}
              className="rounded-lg bg-[#0F5C4D] px-4 py-2 text-sm font-medium text-white hover:bg-[#0c4a3e] disabled:opacity-60 whitespace-nowrap shrink-0 transition-colors"
            >
              {signingIn ? 'Signing in...' : 'Sign in with Google'}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-6 py-12 lg:py-20">
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12">
            <div className="flex flex-col justify-center lg:col-span-6">
              <p className="text-xs font-medium text-[#0F5C4D] dark:text-emerald-400">
                Eswatini & Pan-African Professional Network
              </p>
              <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl lg:text-5xl dark:text-white [text-wrap:balance]">
                Connect with peers, discover verified roles, and build stronger CVs.
              </h1>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-slate-600 dark:text-slate-300">
                One workspace for your professional profile, network, job applications, direct
                messaging, employer recruiting, and AI Career Studio.
              </p>

              {displayError && (
                <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/60 dark:text-red-300">
                  <p>{displayError}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    {firebaseUser && (
                      <>
                        <button
                          type="button"
                          onClick={() => retryAuth()}
                          className="font-semibold underline hover:no-underline"
                        >
                          Retry connection
                        </button>
                        <button
                          type="button"
                          onClick={() => logout()}
                          className="font-medium underline hover:no-underline"
                        >
                          Switch Google account
                        </button>
                      </>
                    )}
                    {isEmbedded ? (
                      <a
                        href={typeof window !== 'undefined' ? window.location.href : '/'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-semibold underline hover:no-underline"
                      >
                        <span>Open in new tab to sign in</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <button
                        type="button"
                        onClick={handleRedirectSignIn}
                        className="font-semibold underline hover:no-underline"
                      >
                        Try redirect sign-in
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="mt-7 flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={handleSignIn}
                  disabled={signingIn}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#0F5C4D] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#0c4a3e] disabled:opacity-60 whitespace-nowrap shrink-0 transition-colors"
                >
                  <span>{signingIn ? 'Connecting...' : 'Continue with Google'}</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
                {isEmbedded ? (
                  <a
                    href={typeof window !== 'undefined' ? window.location.href : '/'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                  >
                    <span>Popup blocked? Open in new tab</span>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={handleRedirectSignIn}
                    disabled={signingIn}
                    className="text-xs font-medium text-slate-600 underline hover:text-slate-900 disabled:opacity-60 dark:text-slate-400 dark:hover:text-slate-200"
                  >
                    Use redirect sign-in
                  </button>
                )}
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-200 dark:border-slate-800 dark:bg-slate-900">
                <img
                  src="/src/assets/images/hero_network_banner_1794998185414.jpg"
                  alt="Professionals collaborating in a Mbabane workspace"
                  referrerPolicy="no-referrer"
                  className="h-full max-h-[380px] w-full object-cover"
                />
              </div>
            </div>
          </div>
        </section>

        {(jobs.length > 0 || posts.length > 0) && (
          <section className="border-t border-slate-200 bg-white py-12 dark:border-slate-800 dark:bg-slate-900">
            <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-6 lg:grid-cols-12">
              {jobs.length > 0 && (
                <div className={posts.length > 0 ? 'lg:col-span-7' : 'lg:col-span-12'}>
                  <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
                    <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                      Open Opportunities
                    </h2>
                    <span className="font-mono text-xs text-slate-500 tabular-nums">
                      {jobs.length} active
                    </span>
                  </div>
                  <div className="divide-y divide-slate-200 dark:divide-slate-800">
                    {jobs.map((job) => (
                      <div key={job.id} className="flex items-start justify-between gap-4 py-4">
                        <div>
                          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                            {job.title}
                          </h3>
                          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                            {job.organization.name} · {job.location}, {job.country} ·{' '}
                            <span className="capitalize">{job.workArrangement}</span>
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={handleSignIn}
                          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 whitespace-nowrap shrink-0"
                        >
                          Sign in to Apply
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {posts.length > 0 && (
                <div className={jobs.length > 0 ? 'lg:col-span-5' : 'lg:col-span-12'}>
                  <div className="border-b border-slate-200 pb-3 dark:border-slate-800">
                    <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                      Recent Updates
                    </h2>
                  </div>
                  <div className="divide-y divide-slate-200 dark:divide-slate-800">
                    {posts.map((post) => (
                      <article key={post.id} className="py-4">
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          <span className="font-medium text-slate-900 dark:text-slate-200">
                            {post.authorName}
                          </span>
                          <span className="mx-1.5" aria-hidden="true">·</span>
                          <span>{post.topic}</span>
                        </div>
                        <p className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                          {post.content}
                        </p>
                      </article>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
};
