import React, { useCallback, useEffect, useState } from 'react';
import { Bookmark, CheckCircle2, Flag, Search } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { JobListing } from '../types';
import { ReportModal } from './ReportModal';

interface CvDoc {
  id: number;
  title: string;
  fileName: string;
}

interface MyApplication {
  id: number;
  jobId: number;
  stage: string;
  coverLetter: string;
  createdAt: string;
  updatedAt: string;
  job: {
    id: number;
    title: string;
    location: string;
    country: string;
    workArrangement: string;
  };
  organization: {
    id: number;
    name: string;
    verified: boolean;
  };
}

interface JobsViewProps {
  initialQuery?: string;
  onClearInitialQuery?: () => void;
}

export const JobsView: React.FC<JobsViewProps> = ({ initialQuery, onClearInitialQuery }) => {
  const { apiFetch } = useAuth();
  const [subTab, setSubTab] = useState<'discover' | 'saved' | 'applications'>('discover');
  const [jobs, setJobs] = useState<JobListing[]>([]);
  const [selectedJob, setSelectedJob] = useState<JobListing | null>(null);
  const [myApps, setMyApps] = useState<MyApplication[]>([]);
  const [cvDocs, setCvDocs] = useState<CvDoc[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [q, setQ] = useState(initialQuery || '');

  useEffect(() => {
    if (initialQuery) {
      setQ(initialQuery);
      onClearInitialQuery?.();
    }
  }, [initialQuery, onClearInitialQuery]);
  const [country, setCountry] = useState('');
  const [workArrangement, setWorkArrangement] = useState('');
  const [employmentType, setEmploymentType] = useState('');
  const [experienceLevel, setExperienceLevel] = useState('');

  // Apply Modal
  const [applyJob, setApplyJob] = useState<JobListing | null>(null);
  const [selectedCvId, setSelectedCvId] = useState<number | ''>('');
  const [coverLetter, setCoverLetter] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [reportJobId, setReportJobId] = useState<number | null>(null);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (q.trim()) qs.set('q', q.trim());
      if (country) qs.set('country', country);
      if (workArrangement) qs.set('workArrangement', workArrangement);
      if (employmentType) qs.set('employmentType', employmentType);
      if (experienceLevel) qs.set('experienceLevel', experienceLevel);

      const [jobsRes, appsRes, careerRes] = await Promise.all([
        apiFetch<{ jobs: JobListing[] }>(`/api/jobs?${qs.toString()}`),
        apiFetch<{ applications: MyApplication[] }>('/api/jobs/applications/me'),
        apiFetch<{ cvDocuments: CvDoc[] }>('/api/career/overview'),
      ]);
      const list = jobsRes.jobs || [];
      setJobs(list);
      setSelectedJob((prev) => list.find((j) => j.id === prev?.id) || list[0] || null);
      setMyApps(appsRes.applications || []);
      setCvDocs(careerRes.cvDocuments || []);
    } finally {
      setLoading(false);
    }
  }, [apiFetch, country, employmentType, experienceLevel, q, workArrangement]);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  const handleToggleSave = async (jobId: number) => {
    await apiFetch(`/api/jobs/${jobId}/save`, { method: 'POST' });
    await loadJobs();
  };

  const handleApplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!applyJob) return;
    setSubmitting(true);
    setMessage('');
    try {
      await apiFetch(`/api/jobs/${applyJob.id}/apply`, {
        method: 'POST',
        body: JSON.stringify({
          cvDocumentId: selectedCvId ? Number(selectedCvId) : null,
          coverLetter,
        }),
      });
      setApplyJob(null);
      setCoverLetter('');
      setMessage('Application submitted successfully.');
      await loadJobs();
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'Unable to submit application');
    } finally {
      setSubmitting(false);
    }
  };

  const handleWithdraw = async (appId: number) => {
    await apiFetch(`/api/jobs/applications/${appId}/withdraw`, { method: 'POST' });
    await loadJobs();
  };

  const displayedJobs = subTab === 'saved' ? jobs.filter((j) => j.isSaved) : jobs;

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Jobs & Opportunities</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Search verified openings across Eswatini, SADC, and remote teams.
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
          {(['discover', 'saved', 'applications'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setSubTab(tab)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors whitespace-nowrap shrink-0 ${
                subTab === tab
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
              }`}
            >
              {tab === 'applications'
                ? `My Applications (${myApps.length})`
                : tab === 'saved'
                ? `Saved (${jobs.filter((j) => j.isSaved).length})`
                : 'Discover Jobs'}
            </button>
          ))}
        </div>
      </div>

      {message && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
          {message}
        </div>
      )}

      {subTab === 'applications' ? (
        <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          {myApps.length === 0 ? (
            <p className="p-8 text-center text-sm text-slate-500">
              You have not applied to any roles yet. Explore open opportunities to get started.
            </p>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {myApps.map((app) => (
                <div key={app.id} className="flex flex-wrap items-center justify-between gap-4 p-4">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                      {app.job.title}
                    </h3>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {app.organization.name} · {app.job.location}, {app.job.country} ·{' '}
                      <span className="capitalize">{app.job.workArrangement}</span>
                    </p>
                    <p className="mt-1 font-mono text-xs text-slate-400 tabular-nums">
                      Applied {new Date(app.createdAt).toLocaleDateString()} · Stage:{' '}
                      <strong className="uppercase text-slate-700 dark:text-slate-200">
                        {app.stage}
                      </strong>
                    </p>
                  </div>
                  {!['offer', 'rejected', 'withdrawn'].includes(app.stage) && (
                    <button
                      type="button"
                      onClick={() => handleWithdraw(app.id)}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                    >
                      Withdraw Application
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Filter Bar */}
          <div className="grid grid-cols-1 gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-2 lg:grid-cols-6 dark:border-slate-800 dark:bg-slate-900">
            <div className="relative lg:col-span-2">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Role, skill, or organization..."
                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs dark:border-slate-700 dark:bg-slate-950"
              />
            </div>
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
            >
              <option value="">All Countries</option>
              <option value="Eswatini">Eswatini</option>
              <option value="South Africa">South Africa</option>
              <option value="Botswana">Botswana</option>
              <option value="Remote / Global">Remote / Global</option>
            </select>
            <select
              value={workArrangement}
              onChange={(e) => setWorkArrangement(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
            >
              <option value="">All Arrangements</option>
              <option value="remote">Remote</option>
              <option value="hybrid">Hybrid</option>
              <option value="onsite">Onsite</option>
            </select>
            <select
              value={employmentType}
              onChange={(e) => setEmploymentType(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
            >
              <option value="">All Types</option>
              <option value="full-time">Full-time</option>
              <option value="part-time">Part-time</option>
              <option value="contract">Contract</option>
              <option value="internship">Internship</option>
            </select>
            <select
              value={experienceLevel}
              onChange={(e) => setExperienceLevel(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
            >
              <option value="">All Levels</option>
              <option value="entry">Entry</option>
              <option value="mid">Mid</option>
              <option value="senior">Senior</option>
              <option value="executive">Executive</option>
            </select>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Job List */}
            <div className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white lg:col-span-5 dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
              {loading ? (
                <p className="p-6 text-xs text-slate-500">Loading vacancies...</p>
              ) : displayedJobs.length === 0 ? (
                <p className="p-6 text-xs text-slate-500">No vacancies match your filters.</p>
              ) : (
                displayedJobs.map((job) => (
                  <button
                    key={job.id}
                    type="button"
                    onClick={() => setSelectedJob(job)}
                    className={`block w-full p-4 text-left transition-colors ${
                      selectedJob?.id === job.id
                        ? 'bg-emerald-50/60 dark:bg-slate-800/80'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                        {job.title}
                      </h3>
                      {job.applicationStage && (
                        <span className="font-mono text-[11px] uppercase text-[#0F5C4D] dark:text-emerald-400">
                          {job.applicationStage}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                      {job.organization.name} · {job.location}, {job.country}
                    </p>
                    <p className="mt-1 text-xs text-slate-400 capitalize">
                      {job.workArrangement} · {job.employmentType} · {job.experienceLevel}
                    </p>
                  </button>
                ))
              )}
            </div>

            {/* Job Detail Inspector */}
            <div className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-7 dark:border-slate-800 dark:bg-slate-900">
              {selectedJob ? (
                <div>
                  <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
                    <div>
                      <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                        {selectedJob.title}
                      </h2>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300">
                        <span className="font-medium">{selectedJob.organization.name}</span>
                        {selectedJob.organization.verified && (
                          <CheckCircle2 className="h-4 w-4 text-[#0F5C4D] dark:text-emerald-400" />
                        )}
                        <span aria-hidden="true">·</span>
                        <span>
                          {selectedJob.location}, {selectedJob.country}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span className="capitalize">{selectedJob.workArrangement}</span>
                        <span aria-hidden="true">·</span>
                        <span className="capitalize">{selectedJob.employmentType}</span>
                        <span aria-hidden="true">·</span>
                        <span className="capitalize">{selectedJob.experienceLevel} level</span>
                        {selectedJob.salaryRange && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums">{selectedJob.salaryRange}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleToggleSave(selectedJob.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
                      >
                        <Bookmark className="h-3.5 w-3.5" />
                        {selectedJob.isSaved ? 'Saved' : 'Save'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setApplyJob(selectedJob)}
                        disabled={Boolean(
                          selectedJob.applicationStage && selectedJob.applicationStage !== 'withdrawn'
                        )}
                        className="rounded-lg bg-[#0F5C4D] px-4 py-2 text-xs font-medium text-white hover:bg-[#0c4a3e] disabled:opacity-50"
                      >
                        {selectedJob.applicationStage && selectedJob.applicationStage !== 'withdrawn'
                          ? `Applied (${selectedJob.applicationStage})`
                          : 'Apply Now'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setReportJobId(selectedJob.id)}
                        className="rounded-lg border border-slate-300 p-2 text-slate-500 hover:text-red-600 dark:border-slate-700"
                        title="Report job posting"
                      >
                        <Flag className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-5 space-y-5 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Role Description
                      </h3>
                      <p className="mt-2 whitespace-pre-wrap">{selectedJob.description}</p>
                    </div>
                    {selectedJob.requirements && (
                      <div>
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Requirements
                        </h3>
                        <p className="mt-2 whitespace-pre-wrap">{selectedJob.requirements}</p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500">Select a job listing to inspect full details.</p>
              )}
            </div>
          </div>
        </>
      )}

      {/* Apply Modal */}
      {applyJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              Apply for {applyJob.title}
            </h3>
            <p className="text-xs text-slate-500">{applyJob.organization.name}</p>
            <form onSubmit={handleApplySubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Attach CV from Career Studio (optional)
                </label>
                <select
                  value={selectedCvId}
                  onChange={(e) => setSelectedCvId(e.target.value ? Number(e.target.value) : '')}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                >
                  <option value="">Use my ResuMind profile only</option>
                  {cvDocs.map((doc) => (
                    <option key={doc.id} value={doc.id}>
                      {doc.title} ({doc.fileName})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Cover Note
                </label>
                <textarea
                  rows={5}
                  value={coverLetter}
                  onChange={(e) => setCoverLetter(e.target.value)}
                  placeholder="Highlight your relevant experience and motivation..."
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setApplyJob(null)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium dark:border-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-[#0F5C4D] px-4 py-2 text-xs font-medium text-white hover:bg-[#0c4a3e] disabled:opacity-50"
                >
                  {submitting ? 'Submitting...' : 'Submit Application'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {reportJobId !== null && (
        <ReportModal
          targetType="job"
          targetId={reportJobId}
          label="job posting"
          onClose={() => setReportJobId(null)}
        />
      )}
    </div>
  );
};
