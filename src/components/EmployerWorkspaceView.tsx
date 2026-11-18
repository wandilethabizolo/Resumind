import React, { useCallback, useEffect, useState } from 'react';
import { Building2, CheckCircle2, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { OrganizationSummary } from '../types';

interface OrgJob {
  id: number;
  title: string;
  location: string;
  country: string;
  workArrangement: string;
  employmentType: string;
  status: 'draft' | 'published' | 'closed';
  createdAt: string;
}

interface OrgMember {
  id: number;
  userId: number;
  role: string;
  fullName: string;
  email: string;
  headline: string;
}

interface OrgApplication {
  id: number;
  jobTitle: string;
  stage: string;
  coverLetter: string;
  employerNotes: string;
  createdAt: string;
  applicant: { id: number; fullName: string; email: string };
  profile: { headline: string; location: string; country: string; skills: string[] };
  cvDocument: { id: number; title: string; fileName: string; extractedText: string } | null;
}

export const EmployerWorkspaceView: React.FC = () => {
  const { organizations, apiFetch, refreshSession } = useAuth();
  const [selectedOrgId, setSelectedOrgId] = useState<number | null>(organizations[0]?.id ?? null);
  const [subTab, setSubTab] = useState<'jobs' | 'applicants' | 'team' | 'analytics'>('jobs');

  const [orgJobs, setOrgJobs] = useState<OrgJob[]>([]);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [applications, setApplications] = useState<OrgApplication[]>([]);
  const [analytics, setAnalytics] = useState<{
    totalJobs: number;
    publishedJobs: number;
    totalApplications: number;
    byStage: Record<string, number>;
  } | null>(null);

  // Create org form
  const [showNewOrg, setShowNewOrg] = useState(organizations.length === 0);
  const [orgName, setOrgName] = useState('');
  const [orgIndustry, setOrgIndustry] = useState('Technology');
  const [orgLocation, setOrgLocation] = useState('Mbabane');
  const [orgCountry, setOrgCountry] = useState('Eswatini');
  const [orgDesc, setOrgDesc] = useState('');

  // Create job form
  const [jobTitle, setJobTitle] = useState('');
  const [jobDesc, setJobDesc] = useState('');
  const [jobReqs, setJobReqs] = useState('');
  const [jobLoc, setJobLoc] = useState('Mbabane');
  const [jobCountry, setJobCountry] = useState('Eswatini');
  const [jobArr, setJobArr] = useState<'remote' | 'hybrid' | 'onsite'>('hybrid');
  const [jobType, setJobType] = useState<'full-time' | 'part-time' | 'contract' | 'internship'>('full-time');
  const [jobLevel, setJobLevel] = useState<'entry' | 'mid' | 'senior' | 'executive'>('mid');
  const [jobSalary, setJobSalary] = useState('');

  // Invite member form
  const [memberEmail, setMemberEmail] = useState('');
  const [memberRole, setMemberRole] = useState<'admin' | 'recruiter' | 'viewer'>('recruiter');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const selectedOrg: OrganizationSummary | null =
    organizations.find((o) => o.id === selectedOrgId) || organizations[0] || null;

  useEffect(() => {
    if (!selectedOrgId && organizations[0]) {
      setSelectedOrgId(organizations[0].id);
      setShowNewOrg(false);
    }
  }, [organizations, selectedOrgId]);

  const loadWorkspace = useCallback(async () => {
    if (!selectedOrg) return;
    try {
      const [jobsRes, appsRes, membersRes, statsRes] = await Promise.all([
        apiFetch<{ jobs: OrgJob[] }>(`/api/organizations/${selectedOrg.id}/jobs`),
        apiFetch<{ applications: OrgApplication[] }>(`/api/organizations/${selectedOrg.id}/applications`),
        apiFetch<{ members: OrgMember[] }>(`/api/organizations/${selectedOrg.id}/members`),
        apiFetch<{
          totalJobs: number;
          publishedJobs: number;
          totalApplications: number;
          byStage: Record<string, number>;
        }>(`/api/organizations/${selectedOrg.id}/analytics`),
      ]);
      setOrgJobs(jobsRes.jobs || []);
      setApplications(appsRes.applications || []);
      setMembers(membersRes.members || []);
      setAnalytics(statsRes);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to load organization workspace');
    }
  }, [apiFetch, selectedOrg]);

  useEffect(() => {
    loadWorkspace();
  }, [loadWorkspace]);

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const res = await apiFetch<{ organization: OrganizationSummary }>('/api/organizations', {
        method: 'POST',
        body: JSON.stringify({
          name: orgName,
          industry: orgIndustry,
          location: orgLocation,
          country: orgCountry,
          description: orgDesc,
        }),
      });
      await refreshSession();
      setSelectedOrgId(res.organization.id);
      setShowNewOrg(false);
      setOrgName('');
      setOrgDesc('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create organization');
    }
  };

  const handleCreateJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrg) return;
    setError('');
    try {
      await apiFetch(`/api/organizations/${selectedOrg.id}/jobs`, {
        method: 'POST',
        body: JSON.stringify({
          title: jobTitle,
          description: jobDesc,
          requirements: jobReqs,
          location: jobLoc,
          country: jobCountry,
          workArrangement: jobArr,
          employmentType: jobType,
          experienceLevel: jobLevel,
          salaryRange: jobSalary,
          status: 'published',
        }),
      });
      setJobTitle('');
      setJobDesc('');
      setJobReqs('');
      setJobSalary('');
      setMessage('Job vacancy published.');
      await loadWorkspace();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to publish job');
    }
  };

  const handleUpdateJobStatus = async (jobId: number, status: 'published' | 'closed') => {
    if (!selectedOrg) return;
    await apiFetch(`/api/organizations/${selectedOrg.id}/jobs/${jobId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    await loadWorkspace();
  };

  const handleUpdateStage = async (appId: number, stage: string, employerNotes?: string) => {
    if (!selectedOrg) return;
    await apiFetch(`/api/organizations/${selectedOrg.id}/applications/${appId}/stage`, {
      method: 'PATCH',
      body: JSON.stringify({ stage, employerNotes }),
    });
    await loadWorkspace();
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrg) return;
    setError('');
    try {
      await apiFetch(`/api/organizations/${selectedOrg.id}/members`, {
        method: 'POST',
        body: JSON.stringify({ email: memberEmail, role: memberRole }),
      });
      setMemberEmail('');
      await loadWorkspace();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add member');
    }
  };

  const handleRemoveMember = async (memberId: number) => {
    if (!selectedOrg) return;
    await apiFetch(`/api/organizations/${selectedOrg.id}/members/${memberId}`, {
      method: 'DELETE',
    });
    await loadWorkspace();
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">For Employers</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Manage organization pages, recruitment teams, vacancies, and candidate pipelines.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {organizations.length > 0 && (
            <select
              value={selectedOrg?.id || ''}
              onChange={(e) => setSelectedOrgId(Number(e.target.value))}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium dark:border-slate-700 dark:bg-slate-900"
            >
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name} ({org.memberRole})
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={() => setShowNewOrg((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F5C4D] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#0c4a3e]"
          >
            <Plus className="h-3.5 w-3.5" />
            New Organization
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}
      {message && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
          {message}
        </div>
      )}

      {showNewOrg && (
        <form
          onSubmit={handleCreateOrg}
          className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
        >
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Create Organization Workspace
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              type="text"
              required
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="Organization Name"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
            <input
              type="text"
              value={orgIndustry}
              onChange={(e) => setOrgIndustry(e.target.value)}
              placeholder="Industry"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
            <input
              type="text"
              value={orgLocation}
              onChange={(e) => setOrgLocation(e.target.value)}
              placeholder="City"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
            <input
              type="text"
              value={orgCountry}
              onChange={(e) => setOrgCountry(e.target.value)}
              placeholder="Country"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
            <textarea
              rows={3}
              value={orgDesc}
              onChange={(e) => setOrgDesc(e.target.value)}
              placeholder="Organization mission and overview..."
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm sm:col-span-2 dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
          <div className="flex justify-end gap-2">
            {organizations.length > 0 && (
              <button
                type="button"
                onClick={() => setShowNewOrg(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium dark:border-slate-700"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              className="rounded-lg bg-[#0F5C4D] px-4 py-2 text-xs font-medium text-white"
            >
              Create Organization
            </button>
          </div>
        </form>
      )}

      {selectedOrg ? (
        <>
          {/* Org Header */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-slate-100 text-[#0F5C4D] dark:bg-slate-800 dark:text-emerald-400">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    {selectedOrg.name}
                  </h2>
                  {selectedOrg.verified && (
                    <CheckCircle2 className="h-4 w-4 text-[#0F5C4D] dark:text-emerald-400" />
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  {selectedOrg.industry} · {selectedOrg.location}, {selectedOrg.country} ·
                  Verification: <span className="capitalize">{selectedOrg.verificationStatus}</span>
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {!selectedOrg.verified && (
                <button
                  type="button"
                  onClick={async () => {
                    await apiFetch(`/api/organizations/${selectedOrg.id}/verify-request`, {
                      method: 'POST',
                    });
                    setMessage('Verification request submitted.');
                    await refreshSession();
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium dark:border-slate-700"
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Request Verification
                </button>
              )}
              <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
                {(['jobs', 'applicants', 'team', 'analytics'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setSubTab(t)}
                    className={`rounded-md px-3 py-1 text-xs font-medium capitalize ${
                      subTab === t
                        ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {subTab === 'jobs' && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              <form
                onSubmit={handleCreateJob}
                className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 lg:col-span-5 dark:border-slate-800 dark:bg-slate-900"
              >
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Publish New Job Vacancy
                </h3>
                <input
                  type="text"
                  required
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  placeholder="Job Title"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    required
                    value={jobLoc}
                    onChange={(e) => setJobLoc(e.target.value)}
                    placeholder="Location"
                    className="rounded-lg border border-slate-300 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
                  />
                  <input
                    type="text"
                    required
                    value={jobCountry}
                    onChange={(e) => setJobCountry(e.target.value)}
                    placeholder="Country"
                    className="rounded-lg border border-slate-300 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
                  />
                  <select
                    value={jobArr}
                    onChange={(e) => setJobArr(e.target.value as 'remote' | 'hybrid' | 'onsite')}
                    className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
                  >
                    <option value="hybrid">Hybrid</option>
                    <option value="remote">Remote</option>
                    <option value="onsite">Onsite</option>
                  </select>
                  <select
                    value={jobType}
                    onChange={(e) =>
                      setJobType(
                        e.target.value as 'full-time' | 'part-time' | 'contract' | 'internship'
                      )
                    }
                    className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
                  >
                    <option value="full-time">Full-time</option>
                    <option value="part-time">Part-time</option>
                    <option value="contract">Contract</option>
                    <option value="internship">Internship</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={jobLevel}
                    onChange={(e) =>
                      setJobLevel(e.target.value as 'entry' | 'mid' | 'senior' | 'executive')
                    }
                    className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
                  >
                    <option value="entry">Entry</option>
                    <option value="mid">Mid</option>
                    <option value="senior">Senior</option>
                    <option value="executive">Executive</option>
                  </select>
                  <input
                    type="text"
                    value={jobSalary}
                    onChange={(e) => setJobSalary(e.target.value)}
                    placeholder="Compensation range (optional)"
                    className="rounded-lg border border-slate-300 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
                <textarea
                  rows={4}
                  required
                  value={jobDesc}
                  onChange={(e) => setJobDesc(e.target.value)}
                  placeholder="Role description and responsibilities..."
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
                />
                <textarea
                  rows={3}
                  value={jobReqs}
                  onChange={(e) => setJobReqs(e.target.value)}
                  placeholder="Requirements and qualifications..."
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
                />
                <button
                  type="submit"
                  className="w-full rounded-lg bg-[#0F5C4D] py-2 text-xs font-medium text-white hover:bg-[#0c4a3e]"
                >
                  Publish Job
                </button>
              </form>

              <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white lg:col-span-7 dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
                {orgJobs.length === 0 ? (
                  <p className="p-6 text-xs text-slate-500">No vacancies created yet.</p>
                ) : (
                  orgJobs.map((j) => (
                    <div key={j.id} className="flex items-center justify-between gap-4 p-4">
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">
                          {j.title}
                        </p>
                        <p className="text-xs text-slate-500">
                          {j.location}, {j.country} · <span className="capitalize">{j.status}</span>
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          handleUpdateJobStatus(j.id, j.status === 'published' ? 'closed' : 'published')
                        }
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium dark:border-slate-700"
                      >
                        {j.status === 'published' ? 'Close Role' : 'Reopen Role'}
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {subTab === 'applicants' && (
            <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
              {applications.length === 0 ? (
                <p className="p-6 text-sm text-slate-500">No candidate applications yet.</p>
              ) : (
                applications.map((app) => (
                  <div key={app.id} className="space-y-3 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                          {app.applicant.fullName} — Applied for {app.jobTitle}
                        </h3>
                        <p className="text-xs text-slate-500">
                          {app.profile.headline} · {app.profile.location}, {app.profile.country}
                        </p>
                      </div>
                      <select
                        value={app.stage}
                        onChange={(e) => handleUpdateStage(app.id, e.target.value)}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium dark:border-slate-700 dark:bg-slate-950"
                      >
                        <option value="submitted">Submitted</option>
                        <option value="screening">Screening</option>
                        <option value="interview">Interview</option>
                        <option value="offer">Offer</option>
                        <option value="rejected">Rejected</option>
                      </select>
                    </div>
                    {app.coverLetter && (
                      <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-700 dark:bg-slate-950 dark:text-slate-300">
                        <strong>Cover Note:</strong> {app.coverLetter}
                      </p>
                    )}
                    {app.cvDocument && (
                      <details className="text-xs text-slate-600 dark:text-slate-400">
                        <summary className="cursor-pointer font-medium text-[#0F5C4D] dark:text-emerald-400">
                          View Attached CV ({app.cvDocument.title})
                        </summary>
                        <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 p-3 text-[11px] dark:border-slate-800">
                          {app.cvDocument.extractedText}
                        </pre>
                      </details>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {subTab === 'team' && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              <form
                onSubmit={handleAddMember}
                className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 lg:col-span-5 dark:border-slate-800 dark:bg-slate-900"
              >
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Add Team Member
                </h3>
                <input
                  type="email"
                  required
                  value={memberEmail}
                  onChange={(e) => setMemberEmail(e.target.value)}
                  placeholder="Colleague's registered email"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
                />
                <select
                  value={memberRole}
                  onChange={(e) =>
                    setMemberRole(e.target.value as 'admin' | 'recruiter' | 'viewer')
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
                >
                  <option value="recruiter">Recruiter (Manage jobs & applicants)</option>
                  <option value="admin">Admin (Manage org & team)</option>
                  <option value="viewer">Viewer (Read-only)</option>
                </select>
                <button
                  type="submit"
                  className="w-full rounded-lg bg-[#0F5C4D] py-2 text-xs font-medium text-white"
                >
                  Add Member
                </button>
              </form>

              <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white lg:col-span-7 dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
                {members.map((m) => (
                  <div key={m.id} className="flex items-center justify-between p-4 text-xs">
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-white">{m.fullName}</p>
                      <p className="text-slate-500">
                        {m.email} · <span className="capitalize">{m.role}</span>
                      </p>
                    </div>
                    {m.role !== 'owner' && (
                      <button
                        type="button"
                        onClick={() => handleRemoveMember(m.id)}
                        className="text-slate-400 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {subTab === 'analytics' && analytics && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <p className="text-xs text-slate-500">Total Vacancies</p>
                <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                  {analytics.totalJobs}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <p className="text-xs text-slate-500">Published Roles</p>
                <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                  {analytics.publishedJobs}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <p className="text-xs text-slate-500">Total Applications</p>
                <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                  {analytics.totalApplications}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <p className="text-xs text-slate-500">In Interview / Offer</p>
                <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-[#0F5C4D] dark:text-emerald-400">
                  {(analytics.byStage.interview || 0) + (analytics.byStage.offer || 0)}
                </p>
              </div>
            </div>
          )}
        </>
      ) : (
        !showNewOrg && (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Create an organization workspace to publish jobs and manage recruitment pipelines.
            </p>
          </div>
        )
      )}
    </div>
  );
};
